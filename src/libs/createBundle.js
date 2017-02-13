import AWS from 'aws-sdk';
import del from 'del';
import execa from 'execa';
import fs from 'fs';
import Listr from 'listr';
import promisify from 'es6-promisify';
import temp from 'temp';
import path from 'path';

import createIndex from './createIndex';
import loadConfig, { BABEL_CONFIG } from '../config';
import { debug } from '../logger';

const makeBabelArgs = (ignore = []) => ([
  '.',
  '--out-dir',
  '.dawson-dist/',
  '--ignore',
  `node_modules,${ignore.join(',')}`,
  (BABEL_CONFIG.babelrc === false) ? '--no-babelrc' : null,
  '--presets',
  BABEL_CONFIG.presets.map(p => Array.isArray(p) ? p[0] : p).join(','), // only preset names, without config
  '--copy-files'
].filter(Boolean));

const s3 = new AWS.S3({});
const writeFile = promisify(fs.writeFile.bind(fs));
const stat = promisify(fs.stat.bind(fs));

const EXEC_MAX_OUTERR_BUFFER_SIZE = 1 * 1024 * 1024 * 1024;
const S3_ZIP_PREFIX = 'lambda-sources';

// --- handles temporary files and deletes them on exit ---
const TEMP_FILES = [];
const tempPath = prefix => {
  const path = temp.path(prefix);
  TEMP_FILES.push(path);
  return path;
};
const cleanupTemp = () => TEMP_FILES.forEach(path => {
  try {
    fs.unlinkSync(path);
  } catch (e) {
  }
});
process.on('exit', cleanupTemp);
// --- / ---

async function createTempFiles () {
  const tempZipFile = tempPath('dawson-zip');
  await del('.dawson-dist');
  return { tempZipFile };
}

function compile ({ ignore }) {
  const babelPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'babel');
  debug('Babel path =', babelPath);
  return execa(babelPath, makeBabelArgs(ignore));
}

function install ({ skipChmod }) {
  return execa.shell(
    `cd .dawson-dist && yarn add babel-cli babel-polyfill babel-preset-env babel-plugin-transform-object-rest-spread && yarn ${skipChmod
      ? ''
      : '&& chmod -Rf a+rX .'}`
  );
}

function writeIndex ({ indexFileContents }) {
  return writeFile(
    process.cwd() + '/.dawson-dist/dawsonindex.js',
    indexFileContents,
    { encoding: 'utf8' }
  );
}

async function zipRoot ({ tempZipFile, excludeList, PROJECT_ROOT }) {
  const excludeArg = '--exclude ' +
    [...excludeList, '.git', '.AppleDouble'].map(i => `\\*${i}\\*`).join(' ');
  await execa.shell(
    `cd .dawson-dist && zip -r ${tempZipFile} . ${excludeArg}`,
    { cwd: PROJECT_ROOT, maxBuffer: EXEC_MAX_OUTERR_BUFFER_SIZE }
  );
  const { size } = await stat(tempZipFile);
  const sizeMB = `${Math.floor(size / 1000000.0)}MB`;
  return { tempZipFileSize: sizeMB };
}

export async function listZipVersions ({ bucketName }) {
  const response = await s3
    .listObjectVersions({ Bucket: bucketName, Prefix: S3_ZIP_PREFIX })
    .promise();
  return response.Versions;
}

async function uploadS3 ({ bucketName, uuid, tempZipFile, tempZipFileSize }) {
  const s3Key = `${S3_ZIP_PREFIX}/${uuid}.zip`;
  const s3Params = {
    Bucket: bucketName,
    Key: s3Key,
    Body: fs.createReadStream(tempZipFile)
    // you must add VersionId here, when fullfilling promises
  };
  const data = await s3.putObject(s3Params).promise();
  const zipS3Location = {
    Bucket: s3Params.Bucket,
    Key: s3Params.Key,
    VersionId: data.VersionId
  };
  return { zipS3Location };
}

export default function taskCreateBundle (
  {
    bucketName,
    appStageName,
    excludeList = [],
    stackName,
    noUpload = false,
    onlyCompile = false,
    skipChmod = false
  },
  result
) {
  const { PROJECT_ROOT, API_DEFINITIONS, SETTINGS } = loadConfig();
  return new Listr([
    {
      title: 'configuring',
      task: ctx => {
        Object.assign(ctx, {
          bucketName,
          excludeList,
          uuid: `${appStageName}-bundle`,
          stackName,
          noUpload,
          onlyCompile,
          ignore: SETTINGS.ignore,
          skipChmod
        });
      }
    },
    {
      title: 'cleaning up',
      skip: ctx => ctx.onlyCompile,
      task: async ctx => {
        const { tempZipFile } = await createTempFiles();
        Object.assign(ctx, { tempZipFile });
      }
    },
    { title: 'compiling', task: compile },
    {
      title: 'installing dependencies',
      skip: ctx => ctx.onlyCompile,
      task: ctx => install({ skipChmod: ctx.skipChmod })
    },
    {
      title: 'creating index file',
      task: async ctx => {
        const { stackName } = ctx;
        const indexFileContents = await createIndex(API_DEFINITIONS, stackName);
        await writeIndex({ indexFileContents });
      }
    },
    {
      title: 'creating zip archive',
      skip: ctx => ctx.noUpload || ctx.onlyCompile,
      task: async ctx => {
        const { tempZipFile, excludeList } = ctx;
        const { tempZipFileSize } = await zipRoot({
          tempZipFile,
          excludeList,
          PROJECT_ROOT
        });
        Object.assign(ctx, { tempZipFileSize });
      }
    },
    {
      title: 'uploading to s3',
      skip: ctx => ctx.noUpload || ctx.onlyCompile,
      task: async ctx => {
        const { bucketName, uuid, tempZipFile, tempZipFileSize } = ctx;
        const { zipS3Location } = await uploadS3({
          bucketName,
          uuid,
          tempZipFile,
          tempZipFileSize
        });
        Object.assign(ctx, { zipS3Location });
        Object.assign(result, { zipS3Location });
      }
    }
  ]);
}
