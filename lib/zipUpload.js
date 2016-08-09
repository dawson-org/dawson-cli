
import promisify from 'es6-promisify';
import AWS from 'aws-sdk';
const s3 = new AWS.S3({});
const putObject = promisify(s3.putObject.bind(s3));
const listObjectVersions = promisify(s3.listObjectVersions.bind(s3));

import fs from 'fs';
const writeFile = promisify(fs.writeFile.bind(fs));
const mkdir = promisify(fs.mkdir.bind(fs));
const stat = promisify(fs.stat.bind(fs));

import temp from 'temp';
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
process.on('uncaughtException', () => { cleanupTemp(); process.exit(1); });

import childProcess from 'child_process';
const exec = promisify(childProcess.exec.bind(childProcess));

import { debug, error } from './logger';
import { PROJECT_ROOT } from './config';
const EXEC_MAX_OUTERR_BUFFER_SIZE = 1 * 1024 * 1024 * 1024;

import {
  templateSupportBucket
} from './cf_support';

const S3_ZIP_PREFIX = 'lambda-sources';

function createTempFiles (args) {
  const { skip } = args;
  if (skip) { return Promise.resolve(args); }
  const tempZipFile = tempPath('danilo-zip');
  const tempIndexFileDir = tempPath('danilo-index');
  const tempIndexFile = tempIndexFileDir + '/daniloindex.js';
  return Promise.resolve()
  .then(() => mkdir(tempIndexFileDir))
  .then(() => ({
    ...args,
    tempZipFile,
    tempIndexFile
  }));
}

function writeIndex (args) {
  const { skip, tempIndexFile, indexFileContents } = args;
  if (skip) { return Promise.resolve(args); }
  return writeFile(
    tempIndexFile,
    indexFileContents,
    { encoding: 'utf8' })
  .then(() => Promise.resolve(args))
  .catch(err => Promise.reject(err));
}

function zipRoot (args) {
  const {
    tempZipFile,
    tempIndexFile,
    skip,
    excludeList
  } = args;
  if (skip) { return Promise.resolve(args); }
  const excludeArg = (excludeList && excludeList.length > 0)
    ? ('--exclude ' + excludeList.map(i => `\\*${i}\\*`).join(' '))
    : '';
  debug('   zip cmd:'.gray, `zip -r ${excludeArg} ${tempZipFile} .`);
  return Promise.resolve()
  .then(() =>
    exec(`zip -r ${tempZipFile} . ${excludeArg}`, {
      cwd: PROJECT_ROOT,
      maxBuffer: EXEC_MAX_OUTERR_BUFFER_SIZE
    })
  )
  .then(() =>
    exec(`zip -j ${tempZipFile} ${tempIndexFile}`, { // -j: junk paths
      cwd: PROJECT_ROOT,
      maxBuffer: EXEC_MAX_OUTERR_BUFFER_SIZE
    })
  )
  .then(() => Promise.resolve(args));
}

function getFileSize (args) {
  const { tempZipFile, skip } = args;
  if (skip) { return Promise.resolve(args); }
  return stat(tempZipFile)
  .then(({ size }) => Promise.resolve({
    ...args,
    tempZipFileSize: Math.floor(size / 1000000.0)
  }));
}

function findZipVersionId ({ uuid, zipVersionsList }) {
  const versionDescriptor = zipVersionsList.find(v => v.Key === `${S3_ZIP_PREFIX}/${uuid}.zip` && v.IsLatest === true);
  if (!versionDescriptor) {
    throw new Error('Version not found: ' + uuid);
  }
  return versionDescriptor.VersionId;
}

export async function listZipVersions ({ appName }) {
  const bucketName = templateSupportBucket({ appName });
  const response = await listObjectVersions({
    Bucket: bucketName,
    Prefix: S3_ZIP_PREFIX
  });
  return response.Versions;
}

function uploadS3 (args) {
  const {
    appName,
    uuid,
    tempZipFile,
    tempZipFileSize,
    skip,
    zipVersionsList
  } = args;
  if (!skip) { debug(`   zip size: ${tempZipFileSize}`);  }
  const bucketName = templateSupportBucket({ appName });
  const s3Key = `${S3_ZIP_PREFIX}/${uuid}.zip`;
  const zipS3Location = {
    Bucket: bucketName,
    Key: s3Key
    // you must add VersionId here, when fullfilling promises
  };
  if (skip) {
    // get latest object's version & proceed
    try {
      const versionId = findZipVersionId({ uuid, zipVersionsList });
      return Promise.resolve({
        ...args,
        zipS3Location: {
          ...zipS3Location,
          VersionId: versionId
        }
      });
    } catch (err) {
      debug('Cannot find lambda zipfile, error:', err.message);
      throw new Error('You cannot skip a lambda function which was has never been deployed');
    }
  }
  const s3Params = {
    ...zipS3Location,
    Body: fs.createReadStream(tempZipFile)
  };
  return putObject(s3Params)
  .then(data => {
    return Promise.resolve({
      ...args,
      zipS3Location: {
        ...zipS3Location,
        VersionId: data.VersionId
      }
    });
  });
}

export function zipAndUpload ({
  appName,
  functionName,
  indexFileContents,
  zipVersionsList,
  skip = false,
  excludeList = []
}) {
  return Promise.resolve({
    uuid: `${appName}-${functionName}-bundle`,
    appName,
    indexFileContents,
    skip,
    excludeList,
    zipVersionsList
  })
  .then(createTempFiles)
  .then(writeIndex)
  .then(zipRoot)
  .then(getFileSize)
  .then(uploadS3)
  .then(({ zipS3Location }) => {
    return Promise.resolve(zipS3Location);
  })
  .catch(err => {
    error('\nError zipping and uploading lambda', err.message);
    return Promise.reject(err);
  });
}
