
import AWS from 'aws-sdk';

import {
  AWS_REGION
} from '../factories/cf_utils';

import { debug } from '../logger';

export function stackUpload ({ bucketName, stackBody }) {
  const s3 = new AWS.S3({});
  const key = 'dawson-root-template-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.template';
  const s3Params = {
    Bucket: bucketName,
    Key: key,
    Body: new Buffer(stackBody, 'utf-8')
  };
  return s3.putObject(s3Params).promise()
  .then(data => {
    const s3Subdomain = (AWS_REGION === 'us-east-1') ? 's3' : `s3-${AWS_REGION}`;
    const url = `https://${s3Subdomain}.amazonaws.com/${bucketName}/${key}`;
    debug('Template URL', url);
    return url;
  });
}
