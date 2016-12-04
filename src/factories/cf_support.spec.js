
import test from 'tape';

import { templateSupportBucket } from './cf_support';

test('templateSupportBucket', t => {
  const expected = 'BucketSupport';
  const actual = templateSupportBucket();
  t.equal(actual, expected, 'should BucketSupport');
  t.end();
});
