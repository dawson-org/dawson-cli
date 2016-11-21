
import { SETTINGS } from '../config';
const domains = SETTINGS.domains || [];

import {
  templateAPIID
} from './cf_apig';

import {
  templateAssetsBucketName
} from './cf_s3';

const cloudfrontRootOrigin = SETTINGS.cloudfrontRootOrigin || 'api';
if (cloudfrontRootOrigin !== 'assets' && cloudfrontRootOrigin !== 'api') {
  throw new Error('Invalid parameter value for cloudfrontRootOrigin. Allowed values are: assets, api');
}

// WebACL
//

function wantsWebACL () {
  return process.env.NODE_ENV === 'production';
}

export function templateWAFWebACLName () {
  return `WWWACL`;
}

export function templateWAFWebACL () {
  if (!wantsWebACL()) {
    return {};
  }
  return {
    [`WebACL${templateWAFWebACLName()}`]: {
      'Type': 'AWS::WAF::WebACL',
      'Properties': {
        'DefaultAction': { 'Type': 'ALLOW' },
        'MetricName': 'WWWACL',
        'Name': `${templateWAFWebACLName()}`
      }
    }
  };
}

export function partialWebACLId () {
  if (!wantsWebACL()) {
    return {};
  }
  return {
    'WebACLId': { 'Ref': `WebACL${templateWAFWebACLName()}` }
  };
}

// CloudFront Distribution
//

export function templateCloudfrontDistributionName () {
  return `WWWDistribution`;
}

export function templateCloudfrontDistribution ({
  stageName
}) {
  const aliases = {};
  if (domains && domains.length > 0) {
    aliases.Aliases = domains;
  }

  const s3Origin = {
    'DomainName': { 'Fn::Join': ['', [
      { 'Ref': `${templateAssetsBucketName()}` },
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
        { Ref: `${templateAPIID()}` },
        '.execute-api.',
        { 'Ref': 'AWS::Region' },
        '.amazonaws.com'
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
    ...templateWAFWebACL(),
    [`${templateCloudfrontDistributionName()}`]: {
      'Type': 'AWS::CloudFront::Distribution',
      'DependsOn': [
        templateAPIID(),
        templateAssetsBucketName()
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
          ...partialWebACLId(),
          ...CustomErrorResponses
        }
      }
    }
  };
}
