
import promisify from 'es6-promisify';
import AWS from 'aws-sdk';
const AWS_REGION = AWS.config.region;

const s3 = new AWS.S3({});
const putObject = promisify(s3.putObject.bind(s3));

import {
  templateSupportBucket
} from './cf_support';

export function stackUpload ({ appName, stackBody }) {
  const bucketName = templateSupportBucket({ appName });
  const key = 'nested-template-' + Date.now() + '' + Math.floor(Math.random() * 1000) + '.template';
  const s3Params = {
    Bucket: bucketName,
    Key: key,
    Body: new Buffer(stackBody, 'utf-8')
  };
  return putObject(s3Params)
  .then(data => {
    const s3Subdomain = (AWS_REGION === 'us-east-1') ? 's3' : `s3-${AWS_REGION}`;
    return Promise.resolve(
      `https://${s3Subdomain}.amazonaws.com/${bucketName}/${key}`
    );
  });
}
