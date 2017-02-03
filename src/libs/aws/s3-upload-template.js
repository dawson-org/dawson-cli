import AWS from 'aws-sdk';
import { debug } from '../../logger';

export default function stackUpload ({ bucketName, stackBody }) {
  const s3 = new AWS.S3({});
  const AWS_REGION = AWS.config.region;
  const key = 'dawson-root-template-' +
    Date.now() +
    '-' +
    Math.floor(Math.random() * 1000) +
    '.template';
  const s3Params = {
    Bucket: bucketName,
    Key: key,
    Body: new Buffer(stackBody, 'utf-8')
  };
  return s3.putObject(s3Params).promise().then(data => {
    const s3Subdomain = AWS_REGION === 'us-east-1' ? 's3' : `s3-${AWS_REGION}`;
    const url = `https://${s3Subdomain}.amazonaws.com/${bucketName}/${key}`;
    const signedDebugUrl = s3.getSignedUrl('getObject', {
      Bucket: bucketName,
      Key: key,
      Expires: 300
    });
    debug('Template URL (signed)', signedDebugUrl);
    return url;
  });
}
