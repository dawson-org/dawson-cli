
import promisify from 'es6-promisify';
import AWS from 'aws-sdk';
import fs from 'fs';
import temp from 'temp';
import execa from 'execa';
import del from 'del';
import Listr from 'listr';

import { PROJECT_ROOT, API_DEFINITIONS, SETTINGS } from '../config';
import createIndex from './createIndex';

const s3 = new AWS.S3({});
const putObject = promisify(s3.putObject.bind(s3));
const listObjectVersions = promisify(s3.listObjectVersions.bind(s3));
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
  } catch (e) {}
});
process.on('exit', cleanupTemp);
// --- / ---

async function createTempFiles () {
  const tempZipFile = tempPath('danilo-zip');
  await del('.dawson-dist');
  return { tempZipFile };
}

function compile () {
  const ignore = SETTINGS.ignore || [];
  return execa('babel', ['.', '--out-dir', '.dawson-dist/', '--ignore', `node_modules,${ignore.join(',')}`, '--copy-files']);
}

function install () {
  return execa.shell('cd .dawson-dist && yarn');
}

function writeIndex ({ indexFileContents }) {
  return writeFile(
    process.cwd() + '/.dawson-dist/daniloindex.js',
    indexFileContents,
    { encoding: 'utf8' });
}

async function zipRoot ({ tempZipFile, excludeList }) {
  const excludeArg = '--exclude ' + [...excludeList, '.git', '.AppleDouble'].map(i => `\\*${i}\\*`).join(' ');
  await execa.shell(`cd .dawson-dist && zip -r ${tempZipFile} . ${excludeArg}`, {
    cwd: PROJECT_ROOT,
    maxBuffer: EXEC_MAX_OUTERR_BUFFER_SIZE
  });
  const { size } = await stat(tempZipFile);
  const sizeMB = `${Math.floor(size / 1000000.0)}MB`;
  return { tempZipFileSize: sizeMB };
}

export async function listZipVersions ({ bucketName }) {
  const response = await listObjectVersions({
    Bucket: bucketName,
    Prefix: S3_ZIP_PREFIX
  });
  return response.Versions;
}

async function uploadS3 ({
    bucketName,
    uuid,
    tempZipFile,
    tempZipFileSize
  }) {
  const s3Key = `${S3_ZIP_PREFIX}/${uuid}.zip`;
  const s3Params = {
    Bucket: bucketName,
    Key: s3Key,
    Body: fs.createReadStream(tempZipFile)
    // you must add VersionId here, when fullfilling promises
  };
  const data = await putObject(s3Params);
  const zipS3Location = {
    Bucket: s3Params.Bucket,
    Key: s3Params.Key,
    VersionId: data.VersionId
  };
  return { zipS3Location };
}

export default function taskCreateBundle ({
  bucketName,
  appStageName,
  excludeList = [],
  stackName,
  noUpload = false,
  onlyCompile = false
}, result) {
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
          onlyCompile
        });
      }
    },
    {
      title: 'cleaning up',
      skip: ctx => ctx.onlyCompile,
      task: async (ctx) => {
        const { tempZipFile } = await createTempFiles();
        Object.assign(ctx, { tempZipFile });
      }
    },
    {
      title: 'compiling',
      task: compile
    },
    {
      title: 'installing dependencies',
      skip: ctx => ctx.onlyCompile,
      task: install
    },
    {
      title: 'creating index file',
      task: async (ctx) => {
        const { stackName } = ctx;
        const indexFileContents = await createIndex(API_DEFINITIONS, stackName);
        await writeIndex({ indexFileContents });
      }
    },
    {
      title: 'creating zip archive',
      skip: ctx => ctx.noUpload || ctx.onlyCompile,
      task: async (ctx) => {
        const { tempZipFile, excludeList } = ctx;
        const { tempZipFileSize } = await zipRoot({ tempZipFile, excludeList });
        Object.assign(ctx, { tempZipFileSize });
      }
    },
    {
      title: 'uploading to s3',
      skip: ctx => ctx.noUpload || ctx.onlyCompile,
      task: async (ctx) => {
        const { bucketName, uuid, tempZipFile, tempZipFileSize } = ctx;
        const { zipS3Location } = await uploadS3({ bucketName, uuid, tempZipFile, tempZipFileSize });
        Object.assign(ctx, { zipS3Location });
        Object.assign(result, { zipS3Location });
      }
    }
  ]);
}
