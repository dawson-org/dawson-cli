
import test from 'tape';

import {
  templateAssetsBucketName,
  templateAssetsBucket
} from './cf_s3';

test('templateAssetsBucketName', t => {
  const expected = 'MyAppAssets';
  const actual = templateAssetsBucketName({ appName: 'MyApp' });
  t.equal(actual, expected, 'should return my app name suffixed by Assets');
  t.end();
});

test('templateAssetsBucket', t => {
  const expected = {
    'MyAppAssets': {
      'Type': 'AWS::S3::Bucket',
      'Properties': {
        'WebsiteConfiguration': {
          'ErrorDocument': 'index.html',
          'IndexDocument': 'index.html'
        }
      }
    }
  };
  const actual = templateAssetsBucket({ appName: 'MyApp' });
  t.deepEqual(actual, expected, 'shoudl return an S3 Bucket template');
  t.end();
});
