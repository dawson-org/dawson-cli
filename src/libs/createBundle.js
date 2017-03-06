import AWS from 'aws-sdk';
import del from 'del';
import execa from 'execa';
import fs from 'fs';
import Listr from 'listr';
import promisify from 'es6-promisify';
import { oneLine } from 'common-tags';

import path from 'path';
import os from 'os';
const IS_WINDOWS = os.platform() === 'win32';

import loadConfig from '../config';
import { debug } from '../logger';
import { debug, DEBUG_LEVEL } from '../logger';

import jsCompile from './language-javascript-latest/compile';
import jsInstallDeps from './language-javascript-latest/installDeps';
import jsCreateIndex from './language-javascript-latest/createIndex';

const s3 = new AWS.S3({});
const writeFile = promisify(fs.writeFile.bind(fs));
const stat = promisify(fs.stat.bind(fs));

const EXEC_MAX_OUTERR_BUFFER_SIZE = 1 * 1024 * 1024 * 1024;
const S3_ZIP_PREFIX = 'lambda-sources';

export const LANGUAGE_JS_LATEST = 'javascript-latest';
const SUPPORTED_LANGUAGES = [LANGUAGE_JS_LATEST];
const LANGUAGE_INVALID_ERR = new Error(`dawson internal error, unknown language in taskCreateBundle.`);

async function createTempFiles () {
  const tempZipFile = path.join(process.cwd(), '.dawson-dist.zip');
  await del('.dawson-dist');
  return { tempZipFile };
}

function writeIndex ({ indexFileContents, indexFileExtension }) {
  const indexFileName = `/.dawson-dist/dawsonindex.${indexFileExtension}`;
  debug('writing Lambda index to', indexFileName);
  return writeFile(
    process.cwd() + indexFileName,
    indexFileContents,
    { encoding: 'utf8' }
  );
}

async function zipRoot ({ tempZipFile, excludeList, rootDir }) {
  const excludeArg = '--exclude ' +
    [...excludeList, '.git', '.AppleDouble'].map(i => `\\*${i}\\*`).join(' ');
  const spawnOpts = {
    cwd: rootDir,
    maxBuffer: EXEC_MAX_OUTERR_BUFFER_SIZE
  };
  if (IS_WINDOWS) {
    const rootDirWindows = rootDir.replace(/\\/g, '/');
    const zipCmd = `bash -c "cd .dawson-dist && zip -8 -r ../.dawson-dist.zip . ${excludeArg}"`;
    const zipDockerCmd = oneLine`
      docker run
        -v "${rootDirWindows}":/dawson-dist
        -w /dawson-dist
      dawsonorg/create-bundle:latest
      ${zipCmd}
    `;
    debug('[windows-compat] zipping using docker:', zipDockerCmd);
    if (DEBUG_LEVEL) {
      spawnOpts.stdio = 'inherit';
    }
    await execa.shell(zipDockerCmd, spawnOpts);
  } else {
    debug('zipping using system\'s built-in command');
    const zipCmd = `cd .dawson-dist && zip -8 -r ${tempZipFile} . ${excludeArg}`;
    await execa.shell(zipCmd, spawnOpts);
  }
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
    { title: 'compiling',
      task: ctx => {
        const { language } = ctx;
        switch (language) {
          case LANGUAGE_JS_LATEST:
            return jsCompile(ctx);
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
        // keep after "compiling" step
        switch (language) {
          case LANGUAGE_JS_LATEST:
            return jsInstallDeps({ skipChmod, rootDir });
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
