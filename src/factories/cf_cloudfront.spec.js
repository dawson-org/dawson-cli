/* eslint no-unused-vars: 0 */

import { test } from 'tap';

import {
  templateCloudfrontDistribution
} from './cf_cloudfront';

test('templateCloudfrontDistribution without WebACL', t => {
  const expected = {
    'WWWDistribution': {
      'DependsOn': [
        'API',
        'BucketAssets'
      ],
      'Properties': {
        'DistributionConfig': {
          'Aliases': [
            'dawson.sh'
          ],
          'CacheBehaviors': [
            {
              'DefaultTTL': '0',
              'ForwardedValues': {
                'QueryString': 'true'
              },
              'MaxTTL': '0',
              'MinTTL': '0',
              'PathPattern': 'assets/*',
              'SmoothStreaming': 'false',
              'TargetOriginId': 's3www',
              'ViewerProtocolPolicy': 'allow-all'
            }
          ],
          'Comment': '',
          'DefaultCacheBehavior': {
            'AllowedMethods': [
              'DELETE',
              'GET',
              'HEAD',
              'OPTIONS',
              'PATCH',
              'POST',
              'PUT'
            ],
            'DefaultTTL': '0',
            'ForwardedValues': {
              'Headers': [
                'Authorization',
                'Accept',
                'Content-Type',
                'Origin',
                'Referer',
                'Access-Control-Request-Headers',
                'Access-Control-Request-Method'
              ],
              'QueryString': 'true'
            },
            'MaxTTL': '0',
            'MinTTL': '0',
            'TargetOriginId': 'api',
            'ViewerProtocolPolicy': 'allow-all'
          },
          'DefaultRootObject': '',
          'Enabled': 'true',
          'Origins': [
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'http-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'BucketAssets'
                    },
                    '.s3-website-',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 's3www'
            },
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'https-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'API'
                    },
                    '.execute-api.',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 'api',
              'OriginPath': '/prod'
            }
          ],
          'PriceClass': 'PriceClass_200',
          'ViewerCertificate': {
            'AcmCertificateArn': 'arn:aws:acm:fake',
            'SslSupportMethod': 'sni-only'
          }
        }
      },
      'Type': 'AWS::CloudFront::Distribution'
    }
  };
  const actual = templateCloudfrontDistribution({
    stageName: 'prod',
    alias: 'dawson.sh',
    acmCertificateArn: 'arn:aws:acm:fake',
    skipAcmCertificate: false,
    cloudfrontRootOrigin: 'api'
  });
  t.deepEqual(actual, expected);
  t.end();
});

test('templateCloudfrontDistribution without aliases', t => {
  const expected = {
    'WWWDistribution': {
      'DependsOn': [
        'API',
        'BucketAssets'
      ],
      'Properties': {
        'DistributionConfig': {
          'CacheBehaviors': [
            {
              'DefaultTTL': '0',
              'ForwardedValues': {
                'QueryString': 'true'
              },
              'MaxTTL': '0',
              'MinTTL': '0',
              'PathPattern': 'assets/*',
              'SmoothStreaming': 'false',
              'TargetOriginId': 's3www',
              'ViewerProtocolPolicy': 'allow-all'
            }
          ],
          'Comment': '',
          'DefaultCacheBehavior': {
            'AllowedMethods': [
              'DELETE',
              'GET',
              'HEAD',
              'OPTIONS',
              'PATCH',
              'POST',
              'PUT'
            ],
            'DefaultTTL': '0',
            'ForwardedValues': {
              'Headers': [
                'Authorization',
                'Accept',
                'Content-Type',
                'Origin',
                'Referer',
                'Access-Control-Request-Headers',
                'Access-Control-Request-Method'
              ],
              'QueryString': 'true'
            },
            'MaxTTL': '0',
            'MinTTL': '0',
            'TargetOriginId': 'api',
            'ViewerProtocolPolicy': 'allow-all'
          },
          'DefaultRootObject': '',
          'Enabled': 'true',
          'Origins': [
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'http-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'BucketAssets'
                    },
                    '.s3-website-',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 's3www'
            },
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'https-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'API'
                    },
                    '.execute-api.',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 'api',
              'OriginPath': '/prod'
            }
          ],
          'PriceClass': 'PriceClass_200',
          'ViewerCertificate': {
            'CloudFrontDefaultCertificate': 'true'
          }
        }
      },
      'Type': 'AWS::CloudFront::Distribution'
    }
  };
  const actual = templateCloudfrontDistribution({
    stageName: 'prod',
    cloudfrontRootOrigin: 'api'
  });
  t.deepEqual(expected, actual);
  t.end();
});

test('templateCloudfrontDistribution with root origin set to assets', t => {
  const expected = {
    'WWWDistribution': {
      'DependsOn': [
        'API',
        'BucketAssets'
      ],
      'Properties': {
        'DistributionConfig': {
          'CacheBehaviors': [
            {
              'AllowedMethods': [
                'DELETE',
                'GET',
                'HEAD',
                'OPTIONS',
                'PATCH',
                'POST',
                'PUT'
              ],
              'DefaultTTL': '0',
              'ForwardedValues': {
                'Headers': [
                  'Authorization',
                  'Accept',
                  'Content-Type',
                  'Origin',
                  'Referer',
                  'Access-Control-Request-Headers',
                  'Access-Control-Request-Method'
                ],
                'QueryString': 'true'
              },
              'MaxTTL': '0',
              'MinTTL': '0',
              'PathPattern': 'prod/*',
              'TargetOriginId': 'api',
              'ViewerProtocolPolicy': 'allow-all'
            }
          ],
          'Comment': '',
          'CustomErrorResponses': [
            {
              'ErrorCachingMinTTL': '30',
              'ErrorCode': '404',
              'ResponseCode': '200',
              'ResponsePagePath': '/index.html'
            },
            {
              'ErrorCachingMinTTL': '30',
              'ErrorCode': '403',
              'ResponseCode': '200',
              'ResponsePagePath': '/index.html'
            }
          ],
          'DefaultCacheBehavior': {
            'DefaultTTL': '0',
            'ForwardedValues': {
              'QueryString': 'true'
            },
            'MaxTTL': '0',
            'MinTTL': '0',
            'SmoothStreaming': 'false',
            'TargetOriginId': 's3www',
            'ViewerProtocolPolicy': 'allow-all'
          },
          'DefaultRootObject': 'index.html',
          'Enabled': 'true',
          'Origins': [
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'http-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'BucketAssets'
                    },
                    '.s3-website-',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 's3www'
            },
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'https-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'API'
                    },
                    '.execute-api.',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 'api'
            }
          ],
          'PriceClass': 'PriceClass_200',
          'ViewerCertificate': {
            'CloudFrontDefaultCertificate': 'true'
          }
        }
      },
      'Type': 'AWS::CloudFront::Distribution'
    }
  };
  const actual = templateCloudfrontDistribution({
    stageName: 'prod',
    cloudfrontRootOrigin: 'assets'
  });
  t.deepEqual(expected, actual);
  t.end();
});

test('templateCloudfrontDistribution with WebACL', t => {
  const expected = {
    'WWWDistribution': {
      'DependsOn': [
        'API',
        'BucketAssets'
      ],
      'Properties': {
        'DistributionConfig': {
          'Aliases': [
            'dawson.sh'
          ],
          'CacheBehaviors': [
            {
              'DefaultTTL': '0',
              'ForwardedValues': {
                'QueryString': 'true'
              },
              'MaxTTL': '0',
              'MinTTL': '0',
              'PathPattern': 'assets/*',
              'SmoothStreaming': 'false',
              'TargetOriginId': 's3www',
              'ViewerProtocolPolicy': 'allow-all'
            }
          ],
          'Comment': '',
          'DefaultCacheBehavior': {
            'AllowedMethods': [
              'DELETE',
              'GET',
              'HEAD',
              'OPTIONS',
              'PATCH',
              'POST',
              'PUT'
            ],
            'DefaultTTL': '0',
            'ForwardedValues': {
              'Headers': [
                'Authorization',
                'Accept',
                'Content-Type',
                'Origin',
                'Referer',
                'Access-Control-Request-Headers',
                'Access-Control-Request-Method'
              ],
              'QueryString': 'true'
            },
            'MaxTTL': '0',
            'MinTTL': '0',
            'TargetOriginId': 'api',
            'ViewerProtocolPolicy': 'allow-all'
          },
          'DefaultRootObject': '',
          'Enabled': 'true',
          'Origins': [
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'http-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'BucketAssets'
                    },
                    '.s3-website-',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 's3www'
            },
            {
              'CustomOriginConfig': {
                'HTTPPort': '80',
                'HTTPSPort': '443',
                'OriginProtocolPolicy': 'https-only'
              },
              'DomainName': {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Ref': 'API'
                    },
                    '.execute-api.',
                    {
                      'Ref': 'AWS::Region'
                    },
                    '.amazonaws.com'
                  ]
                ]
              },
              'Id': 'api',
              'OriginPath': '/prod'
            }
          ],
          'PriceClass': 'PriceClass_200',
          'ViewerCertificate': {
            'AcmCertificateArn': 'arn:aws:acm:fake',
            'SslSupportMethod': 'sni-only'
          },
          'WebACLId': { 'Ref': 'WebACLWWWACL' }
        }
      },
      'Type': 'AWS::CloudFront::Distribution'
    },
    'WebACLWWWACL': {
      'Properties': {
        'DefaultAction': {
          'Type': 'ALLOW'
        },
        'MetricName': 'WWWACL',
        'Name': 'WWWACL'
      },
      'Type': 'AWS::WAF::WebACL'
    }
  };
  const oldEnv = `${process.env.NODE_ENV || ''}`;
  process.env.NODE_ENV = 'production';
  const actual = templateCloudfrontDistribution({
    stageName: 'prod',
    alias: 'dawson.sh',
    acmCertificateArn: 'arn:aws:acm:fake',
    skipAcmCertificate: false,
    cloudfrontRootOrigin: 'api'
  });
  process.env.NODE_ENV = oldEnv;
  t.deepEqual(actual, expected);
  t.end();
});
