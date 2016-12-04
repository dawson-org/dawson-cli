/* eslint no-unused-vars: 0 */

import { test } from 'tap';

import {
  templateSupportBucketName,
  templateSupportStack
} from './cf_support';

test('templateSupportBucketName', t => {
  const expected = 'BucketSupport';
  const actual = templateSupportBucketName();
  t.equal(actual, expected, 'should BucketSupport');
  t.end();
});
