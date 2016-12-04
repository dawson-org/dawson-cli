
import test from 'tape';

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

test.skip('templateCloudfrontDistribution', t => {
  const expected = {};
  const actual = templateCloudfrontDistribution({
    stageName: 'prod'
  });
  t.deepEqual(actual, expected, 'should return');
  t.end();
});
