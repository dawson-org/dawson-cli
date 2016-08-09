
import test from 'tape';

import {
  templateSupportBucket
} from './cf_support';

test('templateSupportBucket', t => {
  const expected = 'Support';
  const actual = templateSupportBucket();
  t.equal(actual, expected, 'should Support');
  t.end();
});
