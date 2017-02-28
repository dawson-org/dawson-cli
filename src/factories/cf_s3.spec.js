import test from 'ava';

import { templateAssetsBucket, templateAssetsBucketName } from './cf_s3';

test('templateAssetsBucketName', t => {
  const expected = 'BucketAssets';
  const actual = templateAssetsBucketName();
  t.deepEqual(actual, expected, 'should return BucketAssets');
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
    },
    BucketAssetsPolicy: {
      Type: 'AWS::S3::BucketPolicy',
      Properties: {
        Bucket: { Ref: 'BucketAssets' },
        PolicyDocument: {
          Statement: [
            {
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  '',
                  ['arn:aws:s3:::', { Ref: 'BucketAssets' }, '/*']
                ]
              },
              Principal: '*'
            }
          ]
        }
      }
    }
  };
  const actual = templateAssetsBucket();
  t.deepEqual(actual, expected, 'should return an S3 Bucket template');
});
