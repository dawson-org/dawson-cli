
import AWS from 'aws-sdk';
import promisify from 'es6-promisify';

import {
  AWS_REGION
} from '../factories/cf_utils';

import { debug } from '../logger';

const s3 = new AWS.S3({});
const putObject = promisify(s3.putObject.bind(s3));

export function stackUpload ({ bucketName, stackBody, region }) {
  const s3Region = region || AWS_REGION;
  const key = 'dawson-root-template-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.template';
  const s3Params = {
    Bucket: bucketName,
    Key: key,
    Body: new Buffer(stackBody, 'utf-8')
  };
  return putObject(s3Params)
  .then(data => {
    const s3Subdomain = (s3Region === 'us-east-1') ? 's3' : `s3-${s3Region}`;
    const url = `https://${s3Subdomain}.amazonaws.com/${bucketName}/${key}`;
    debug('Template URL', url);
    return url;
  });
}
