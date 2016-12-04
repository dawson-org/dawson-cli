
import test from 'tape';

import { templateSupportBucketName } from './cf_support';

test('templateSupportBucketName', t => {
  const expected = 'BucketSupport';
  const actual = templateSupportBucketName();
  t.equal(actual, expected, 'should BucketSupport');
  t.end();
});
