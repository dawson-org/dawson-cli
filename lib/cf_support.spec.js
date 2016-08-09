
import test from 'tape';

import {
  templateSupportBucket
} from './cf_support';

test('templateSupportBucket', t => {
  const expected = 'supportmyapp';
  const actual = templateSupportBucket({ appName: 'MyApp' });
  t.equal(actual, expected, 'should return a lowercased app name, prefixed by support');
  t.end();
});
