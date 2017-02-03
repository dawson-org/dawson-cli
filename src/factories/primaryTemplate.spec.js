import test from 'ava';
import buildPrimaryTemplate from './primaryTemplate';

function fooAPI () {}
fooAPI.api = { path: 'bar', method: 'POST' };

function barAPI () {}
barAPI.api = { path: false, method: 'POST' };

const API_DEFINITIONS = { fooAPI, barAPI };

test('primary template builder', t => {
  const actual = buildPrimaryTemplate({
    acmCertificateArn: 'arn:bar',
    API_DEFINITIONS,
    appStage: 'devel',
    cloudfrontRootOrigin: 'assets',
    cloudfrontSettings: { devel: 'mydomain.com' },
    hostedZoneId: { devel: 'ASDBAR123' },
    skipAcmCertificate: false,
    stackName: '',
    stageName: 'prod',
    supportBucketName: 'support-bucket-test',
    zipS3Location: { S3Bucket: 'b', S3Key: 'k', S3VersionId: 'abc' },
    deploymentUid: 'AVA'
  });
  t.snapshot(actual);
});
