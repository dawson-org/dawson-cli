
import test from 'tape';

import {
  templateAssetsBucketName,
  templateAssetsBucket
} from './cf_s3';

test('templateAssetsBucketName', t => {
  const expected = 'Assets';
  const actual = templateAssetsBucketName();
  t.equal(actual, expected, 'should return Assets');
  t.end();
});

test('templateAssetsBucket', t => {
  const expected = {
    'Assets': {
      'Type': 'AWS::S3::Bucket',
      'Properties': {
        'WebsiteConfiguration': {
          'ErrorDocument': 'index.html',
          'IndexDocument': 'index.html'
        }
      }
    }
  };
  const actual = templateAssetsBucket();
  t.deepEqual(actual, expected, 'shoudl return an S3 Bucket template');
  t.end();
});
