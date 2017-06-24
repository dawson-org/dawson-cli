/* eslint no-unused-vars: 0 */

import test from 'ava';

import { templateRoute53 } from './cf_route53';

test('templateRoute53', t => {
  const expected = {
    Route53Record: {
      Type: 'AWS::Route53::RecordSet',
      Properties: {
        AliasTarget: {
          DNSName: { 'Fn::Sub': '${WWWDistribution.DomainName}' }, // eslint-disable-line
          HostedZoneId: 'Z2FDTNDATAQYW2'
        },
        Comment: 'Record managed by dawson.',
        HostedZoneId: 'XXX',
        Name: 'bar.com',
        Type: 'A'
      }
    }
  };
  const actual = templateRoute53({
    hostedZoneId: 'XXX',
    cloudfrontCustomDomain: 'bar.com'
  });
  t.deepEqual(expected, actual);
});
