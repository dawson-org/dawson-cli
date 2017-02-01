/* eslint no-unused-vars: 0 */

import { test } from 'tap';

import { templateSupportBucketName, templateSupportStack } from './cf_support';

test('templateSupportBucketName', t => {
  const expected = 'BucketSupport';
  const actual = templateSupportBucketName();
  t.equal(actual, expected);
  t.end();
});

test('templateSupportStack', t => {
  const expected = {
    Resources: {
      BucketSupport: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          LifecycleConfiguration: {
            Rules: [
              { Id: 'CleanupAfter7Days', ExpirationInDays: 7, Status: 'Enabled' }
            ]
          },
          VersioningConfiguration: { Status: 'Enabled' }
        }
      }
    },
    Outputs: { SupportBucket: { Value: { Ref: 'BucketSupport' } } }
  };
  const actual = templateSupportStack();
  t.deepEqual(actual, expected);
  t.end();
});
