
import test from 'tape';

import {
  templateCloudfrontDistributionName,
  templateCloudfrontDistribution
} from './cf_cloudfront';

test('templateCloudfrontDistributionName', t => {
  const expected = 'MyAppWWWDistribution';
  const actual = templateCloudfrontDistributionName({ appName: 'MyApp' });
  t.deepEqual(actual, expected, 'should return the app name suffixed by WWWDistribution');
  t.end();
});

test.skip('templateCloudfrontDistribution', t => {
  const expected = {};
  const actual = templateCloudfrontDistribution({
    appName: 'MyApp',
    stageName: 'prod'
  });
  t.deepEqual(actual, expected, 'should return');
  t.end();
});
