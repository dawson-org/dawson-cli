
export function templateRoute53 ({
  hostedZoneId,
  cloudfrontCustomDomain
}) {
  return {
    'Route53Record': {
      'Type': 'AWS::Route53::RecordSet',
      'Properties': {
        'AliasTarget': {
          'DNSName': { 'Fn::Sub': '${WWWDistribution.DomainName}' }, // eslint-disable-line
          'HostedZoneId': 'Z2FDTNDATAQYW2'
        },
        'Comment': 'Record managed by dawson.',
        'HostedZoneId': hostedZoneId,
        'Name': cloudfrontCustomDomain,
        'Type': 'A'
      }
    }
  };
}
