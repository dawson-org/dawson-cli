import AWS from 'aws-sdk';
import del from 'del';
import execa from 'execa';
import fs from 'fs';
import Listr from 'listr';
import promisify from 'es6-promisify';
import temp from 'temp';

import loadConfig from '../config';
import { debug } from '../logger';

import jsCompile from './language-javascript-latest/compile';
import jsInstallDeps from './language-javascript-latest/installDeps';
import jsCreateIndex from './language-javascript-latest/createIndex';

import pyCompile from './language-python/compile';
import pyInstallDeps from './language-python/installDeps';
import pyCreateIndex from './language-python/createIndex';

const s3 = new AWS.S3({});
const writeFile = promisify(fs.writeFile.bind(fs));
const stat = promisify(fs.stat.bind(fs));

const EXEC_MAX_OUTERR_BUFFER_SIZE = 1 * 1024 * 1024 * 1024;
const S3_ZIP_PREFIX = 'lambda-sources';

export const LANGUAGE_JS_LATEST = 'javascript-latest';
export const LANGUAGE_PYTHON = 'python';
const SUPPORTED_LANGUAGES = [LANGUAGE_JS_LATEST, LANGUAGE_PYTHON];
const LANGUAGE_INVALID_ERR = new Error(`dawson internal error, unknown language in taskCreateBundle.`);

// --- handles temporary files and deletes them on exit ---
const TEMP_FILES = [];
const tempPath = prefix => {
  const path = temp.path(prefix);
  TEMP_FILES.push(path);
  return path;
};
const cleanupTemp = () =>
  TEMP_FILES.forEach(path => {
    try {
      fs.unlinkSync(path);
    } catch (e) {}
  });
process.on('exit', cleanupTemp);
// --- / ---

async function createTempFiles () {
  const tempZipFile = tempPath('dawson-zip');
  await del('.dawson-dist');
  return { tempZipFile };
}

function writeIndex ({ indexFileContents, indexFileExtension }) {
  const indexFileName = `/.dawson-dist/dawsonindex.${indexFileExtension}`;
  debug('writing Lambda index to', indexFileName);
  return writeFile(process.cwd() + indexFileName, indexFileContents, {
    encoding: 'utf8'
  });
}

async function zipRoot ({ tempZipFile, excludeList, rootDir }) {
  const excludeArg = '--exclude ' +
    [...excludeList, '.git', '.AppleDouble'].map(i => `\\*${i}\\*`).join(' ');
  await execa.shell(
    `cd .dawson-dist && zip -8 -r ${tempZipFile} . ${excludeArg}`,
    { cwd: rootDir, maxBuffer: EXEC_MAX_OUTERR_BUFFER_SIZE }
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

function getFileExtension (language) {
  switch (language) {
    case LANGUAGE_JS_LATEST:
      return 'js';
    case LANGUAGE_PYTHON:
      return 'py';
    default:
      throw LANGUAGE_INVALID_ERR;
  }
}

export default function taskCreateBundle (args, result) {
  return new Listr([
    {
      title: 'configuring',
      task: ctx => {
        const {
          API_DEFINITIONS,
          language,
          PROJECT_ROOT,
          SETTINGS
        } = loadConfig();

        if (!SUPPORTED_LANGUAGES.includes(language)) {
          throw LANGUAGE_INVALID_ERR;
        }

        const {
          appStageName,
          bucketName,
          excludeList = [],
          noUpload = false,
          onlyCompile = false,
          skipChmod = false,
          stackName
        } = args;

        Object.assign(ctx, {
          apiDefinitions: API_DEFINITIONS,
          bucketName,
          excludeList,
          ignore: SETTINGS.ignore,
          language,
          noUpload,
          onlyCompile,
          rootDir: PROJECT_ROOT,
          skipChmod,
          stackName,
          uuid: `${appStageName}-bundle`
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
    {
      title: 'compiling',
      task: ctx => {
        const { language } = ctx;
        switch (language) {
          case LANGUAGE_JS_LATEST:
            return jsCompile(ctx);
          case LANGUAGE_PYTHON:
            return pyCompile(ctx);
          default:
            throw LANGUAGE_INVALID_ERR;
        }
      }
    },
    {
      title: 'installing dependencies',
      skip: ctx => ctx.onlyCompile,
      task: ctx => {
        const { language, skipChmod, rootDir } = ctx;
        switch (language) {
          case LANGUAGE_JS_LATEST:
            return jsInstallDeps({ skipChmod, rootDir });
          case LANGUAGE_PYTHON:
            return pyInstallDeps({ skipChmod, rootDir });
          default:
            throw LANGUAGE_INVALID_ERR;
        }
      }
    },
    {
      title: 'creating index file',
      task: async ctx => {
        const { stackName, language, apiDefinitions } = ctx;
        const indexFileExtension = getFileExtension(language);
        let indexFileContents;
        switch (language) {
          case LANGUAGE_JS_LATEST:
            indexFileContents = await jsCreateIndex(apiDefinitions, stackName);
            break;
          case LANGUAGE_PYTHON:
            indexFileContents = await pyCreateIndex(apiDefinitions, stackName);
            break;
          default:
            throw LANGUAGE_INVALID_ERR;
        }
        await writeIndex({ indexFileContents, indexFileExtension });
      }
    },
    {
      title: 'creating zip archive',
      skip: ctx => ctx.noUpload || ctx.onlyCompile,
      task: async ctx => {
        const { tempZipFile, excludeList, rootDir } = ctx;
        const { tempZipFileSize } = await zipRoot({
          tempZipFile,
          excludeList,
          rootDir
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
