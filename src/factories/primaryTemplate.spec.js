import test from 'ava';
import generateTemplate from './primaryTemplate';

const fixtures = {};
fixtures.fooAPI = function fooAPI () {};
fixtures.fooAPI.api = { path: 'bar', method: 'POST' };

fixtures.barAPI = function barAPI () {};
fixtures.barAPI.api = { path: false, excludeEnv: ['BucketAssets'] };

fixtures.bazAPI = function bazAPI () {};
fixtures.bazAPI.api = { path: 'xxx', authorizer: fixtures.barAPI };

fixtures.invalidAPI = function invalidAPI () {};

fixtures.processCFTemplate = function processCFTemplate (template) {
  return 'gotta replace it all';
};

fixtures.customTemplateFragment = function customTemplateFragment () {
  return { Resources: { foo: 123 }, Outputs: { Bar: { Value: 'argh' } } };
};

test('primary template builder', t => {
  const actual = generateTemplate({
    acmCertificateArn: 'arn:bar',
    API_DEFINITIONS: { barAPI: fixtures.barAPI },
    appStage: 'devel',
    root: 'assets',
    cloudfrontSettings: 'mydomain.com',
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

test(
  'primary template builder throws if a function is missing the .api property',
  t => {
    const actual = () =>
      generateTemplate({
        acmCertificateArn: 'arn:bar',
        API_DEFINITIONS: {
          fooAPI: fixtures.fooAPI,
          invalidAPI: fixtures.invalidAPI
        },
        appStage: 'devel',
        root: 'assets',
        cloudfrontSettings: 'mydomain.com',
        hostedZoneId: { devel: 'ASDBAR123' },
        skipAcmCertificate: false,
        stackName: '',
        stageName: 'prod',
        supportBucketName: 'support-bucket-test',
        zipS3Location: { S3Bucket: 'b', S3Key: 'k', S3VersionId: 'abc' },
        deploymentUid: 'AVA'
      });
    t.throws(actual);
  }
);

test('primary template builder with cloudfront disabled', t => {
  const actual = generateTemplate({
    acmCertificateArn: 'arn:bar',
    API_DEFINITIONS: { fooAPI: fixtures.fooAPI },
    appStage: 'devel',
    root: 'assets',
    cloudfrontSettings: false,
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

test('primary template builder with a custom post-processor', t => {
  const actual = generateTemplate({
    acmCertificateArn: 'arn:bar',
    API_DEFINITIONS: {
      fooAPI: fixtures.fooAPI,
      processCFTemplate: fixtures.processCFTemplate
    },
    appStage: 'devel',
    root: 'assets',
    cloudfrontSettings: false,
    hostedZoneId: { devel: 'ASDBAR123' },
    skipAcmCertificate: false,
    stackName: '',
    stageName: 'prod',
    supportBucketName: 'support-bucket-test',
    zipS3Location: { S3Bucket: 'b', S3Key: 'k', S3VersionId: 'abc' },
    deploymentUid: 'AVA'
  });
  const expected = '"gotta replace it all"';
  t.is(actual.cfTemplateJSON, expected);
});

test('primary template builder with a method using an authorizer', t => {
  const actual = generateTemplate({
    acmCertificateArn: 'arn:bar',
    API_DEFINITIONS: { bazAPI: fixtures.bazAPI, barAPI: fixtures.barAPI },
    appStage: 'devel',
    root: 'assets',
    cloudfrontSettings: false,
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

test('primary template builder using customTemplateFragment', t => {
  const actual = generateTemplate({
    acmCertificateArn: 'arn:bar',
    API_DEFINITIONS: {
      bazAPI: fixtures.bazAPI,
      barAPI: fixtures.barAPI,
      customTemplateFragment: fixtures.customTemplateFragment
    },
    appStage: 'devel',
    root: 'assets',
    cloudfrontSettings: false,
    hostedZoneId: { devel: 'ASDBAR123' },
    skipAcmCertificate: false,
    stackName: '',
    stageName: 'prod',
    supportBucketName: 'support-bucket-test',
    zipS3Location: { S3Bucket: 'b', S3Key: 'k', S3VersionId: 'abc' },
    deploymentUid: 'AVA'
  });
  t.truthy(actual.cfTemplate);
  const templateObject = actual.cfTemplate;
  t.truthy(templateObject.Resources);
  t.is(templateObject.Resources.foo, 123);
  t.truthy(templateObject.Outputs);
  t.deepEqual(templateObject.Outputs.Bar, { Value: 'argh' });
});
