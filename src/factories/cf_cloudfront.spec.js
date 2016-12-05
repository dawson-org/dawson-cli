/* eslint no-unused-vars: 0 */

import { test } from 'tap';

import {
  templateCloudfrontDistribution,
  templateCloudfrontDistributionName
} from './cf_cloudfront';

test('templateCloudfrontDistributionName', t => {
  const expected = 'WWWDistribution';
  const actual = templateCloudfrontDistributionName();
  t.deepEqual(actual, expected, 'should return WWWDistribution');
  t.end();
});

test('templateCloudfrontDistribution', t => {
  // const expected = {};
  // const actual = templateCloudfrontDistribution({
  //   stageName: 'prod'
  // });
  // @TODO
  t.end();
});
