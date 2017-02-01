import { test } from 'tap';

import { templateAssetsBucket, templateAssetsBucketName } from './cf_s3';

test('templateAssetsBucketName', t => {
  const expected = 'BucketAssets';
  const actual = templateAssetsBucketName();
  t.equal(actual, expected, 'should return BucketAssets');
  t.end();
});

test('templateAssetsBucket', t => {
  const expected = {
    BucketAssets: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        WebsiteConfiguration: {
          ErrorDocument: 'index.html',
          IndexDocument: 'index.html'
        }
      }
    }
  };
  const actual = templateAssetsBucket();
  t.deepEqual(actual, expected, 'should return an S3 Bucket template');
  t.end();
});
