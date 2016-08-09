
import readdirLib from 'recursive-readdir';
const readdir = promisify(readdirLib);

import mime from 'mime';

import promisify from 'es6-promisify';
import AWS from 'aws-sdk';
const s3 = new AWS.S3({});
const putObject = promisify(s3.putObject.bind(s3));

import fs from 'fs';
import path from 'path';

import { debug } from './logger';
import { PROCESS_ROOT } from './config';
const ASSETS_ROOT = path.normalize(PROCESS_ROOT + '/../assets');

function uploadS3 ({ bucketName, filePath }) {
  // we must prepend the assets/ prefix, to allow cloudfront to forward requests correctly
  const s3key = filePath.replace(`${ASSETS_ROOT}/`, 'assets/');
  const s3Params = {
    Bucket: bucketName,
    Key: s3key,
    Body: fs.createReadStream(filePath),
    ACL: 'public-read',
    ContentType: mime.lookup(filePath)
  };
  debug(`=> uploading ${s3key}`.gray);
  return putObject(s3Params);
}

function listFiles () {
  return readdir(ASSETS_ROOT);
}

export function assetsUpload ({ bucketName }) {
  return Promise.resolve()
  .then(listFiles)
  .then(files => {
    const promises = files.map(f => uploadS3({ bucketName, filePath: f }));
    return Promise.all(promises);
  });
}
