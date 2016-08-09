
import { templateAPIID } from './cf_apig';
import { templateAssetsBucketName } from './cf_s3';

import AWS from 'aws-sdk';
const AWS_REGION = AWS.config.region;

import { SETTINGS } from './config';
const domains = SETTINGS.domains || [];

const cloudfrontRootOrigin = SETTINGS.cloudfrontRootOrigin || 'api';
if (cloudfrontRootOrigin !== 'assets' && cloudfrontRootOrigin !== 'api') {
  throw new Error('Invalid parameter value for cloudfrontRootOrigin. Allowed values are: assets, api');
}

export function templateCloudfrontDistributionName ({ appName }) {
  return `${appName}WWWDistribution`;
}

export function templateCloudfrontDistribution ({
  appName,
  stageName
}) {
  const aliases = {};
  if (domains && domains.length > 0) {
    aliases.Aliases = domains;
  }
  if (SETTINGS.cloudfront === false) {
    return {};
  }

  const s3Origin = {
    'DomainName': { 'Fn::Join': ['', [
      { 'Ref': `${templateAssetsBucketName({ appName })}` },
      '.s3-website-',
      { 'Ref': 'AWS::Region' },
      '.amazonaws.com'
    ]] },
    'Id': 's3www',
    'CustomOriginConfig': {
      'HTTPPort': '80',
      'HTTPSPort': '443',
      'OriginProtocolPolicy': 'http-only'
    }
  };

  const s3CB = {
    'TargetOriginId': 's3www',
    'SmoothStreaming': 'false',
    'ForwardedValues': {
      'QueryString': 'true'
    },
    'MinTTL': '0',
    'MaxTTL': '0',
    'DefaultTTL': '0',
    'ViewerProtocolPolicy': 'allow-all',
    'PathPattern': 'assets/*'
  };

  const apiOrigin = {
    'DomainName': {
      'Fn::Join': ['', [
        { Ref: `${templateAPIID({ appName })}` },
        '.execute-api.', AWS_REGION, '.amazonaws.com'
      ]]
    },
    'Id': 'api',
    'OriginPath': `/${stageName}`,
    'CustomOriginConfig': {
      'HTTPPort': '80',
      'HTTPSPort': '443',
      'OriginProtocolPolicy': 'https-only'
    }
  };

  const apiCB = {
    'AllowedMethods': ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
    'TargetOriginId': 'api',
    'ForwardedValues': {
      'QueryString': 'true',
      'Headers': [
        'Authorization',
        'Accept',
        'Content-Type',
        'Origin',
        'Referer',
        'Access-Control-Request-Headers',
        'Access-Control-Request-Method'
      ]
    },
    'ViewerProtocolPolicy': 'allow-all',
    'MinTTL': '0',
    'MaxTTL': '0',
    'DefaultTTL': '0'
  };

  let defaultCB;
  let otherCB;
  let defaultRootObject;
  let CustomErrorResponses;
  if (cloudfrontRootOrigin === 'assets') {
    delete s3CB.PathPattern; // serve root from s3
    apiCB.PathPattern = 'prod/*'; // serve api from api/
    delete apiOrigin.OriginPath; // do not add trailing prod/ when fwding api
    s3Origin.OriginPath = '/assets/app'; // add trailing dir when fwding s3
    defaultRootObject = 'index.html';
    defaultCB = s3CB;
    otherCB = apiCB;
    CustomErrorResponses = {
      'CustomErrorResponses': [{
        'ErrorCode': '404',
        'ResponsePagePath': '/index.html',
        'ResponseCode': '200',
        'ErrorCachingMinTTL': '30'
      }, {
        'ErrorCode': '403',
        'ResponsePagePath': '/index.html',
        'ResponseCode': '200',
        'ErrorCachingMinTTL': '30'
      }]
    };
  } else {
    defaultRootObject = '';
    defaultCB = apiCB;
    otherCB = s3CB;
    CustomErrorResponses = {};
  }

  return {
    [`${templateCloudfrontDistributionName({ appName })}`]: {
      'Type': 'AWS::CloudFront::Distribution',
      'DependsOn': [
        templateAPIID({ appName }),
        templateAssetsBucketName({ appName })
      ],
      'Properties': {
        'DistributionConfig': {
          ...aliases,
          'Origins': [
            s3Origin,
            apiOrigin
          ],
          'Enabled': 'true',
          'Comment': '',
          'DefaultRootObject': defaultRootObject,
          'DefaultCacheBehavior': defaultCB,
          'CacheBehaviors': [otherCB],
          'PriceClass': 'PriceClass_200',
          'ViewerCertificate': { 'CloudFrontDefaultCertificate': 'true' },
          ...CustomErrorResponses
        }
      }
    }
  };
}
