import { templateAPIID } from './cf_apig';
import { templateAssetsBucketName } from './cf_s3';
import { debug } from '../logger';

export const WHITELISTED_HEADERS = [
  'authorization',
  'accept',
  'accept-language',
  'content-type',
  'origin',
  'referer',
  'access-control-request-headers',
  'access-control-request-method',
  'token'
];

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
      Type: 'AWS::WAF::WebACL',
      Properties: {
        DefaultAction: { Type: 'ALLOW' },
        MetricName: 'WWWACL',
        Name: `${templateWAFWebACLName()}`
      }
    }
  };
}

export function partialWebACLId () {
  if (!wantsWebACL()) {
    return {};
  }
  return { WebACLId: { Ref: `WebACL${templateWAFWebACLName()}` } };
}

// CloudFront Distribution
//

export function templateCloudfrontDistributionName () {
  return `WWWDistribution`;
}

function templateViewerCertificate (
  { stageName, alias, acmCertificateArn, skipAcmCertificate }
) {
  if (!alias || skipAcmCertificate) {
    debug(`Skipping ACM SSL/TLS Certificate validation`);
    return { ViewerCertificate: { CloudFrontDefaultCertificate: 'true' } };
  }
  return {
    ViewerCertificate: {
      AcmCertificateArn: acmCertificateArn,
      SslSupportMethod: 'sni-only'
    }
  };
}

export function templateCloudfrontDistribution (
  {
    stageName,
    alias,
    acmCertificateArn,
    skipAcmCertificate,
    root
  }
) {
  const aliasesConfig = {};
  if (alias) {
    aliasesConfig.Aliases = [alias];
  }

  const s3Origin = {
    DomainName: {
      'Fn::Join': [
        '',
        [
          { Ref: `${templateAssetsBucketName()}` },
          '.s3-website-',
          { Ref: 'AWS::Region' },
          '.amazonaws.com'
        ]
      ]
    },
    Id: 's3www',
    CustomOriginConfig: {
      HTTPPort: '80',
      HTTPSPort: '443',
      OriginProtocolPolicy: 'http-only'
    }
  };

  const s3CB = {
    TargetOriginId: 's3www',
    SmoothStreaming: 'false',
    ForwardedValues: { QueryString: 'true' },
    MinTTL: '0',
    MaxTTL: '0',
    DefaultTTL: '0',
    ViewerProtocolPolicy: 'allow-all',
    PathPattern: 'assets/*'
  };

  const apiOrigin = {
    DomainName: {
      'Fn::Join': [
        '',
        [
          { Ref: `${templateAPIID()}` },
          '.execute-api.',
          { Ref: 'AWS::Region' },
          '.amazonaws.com'
        ]
      ]
    },
    Id: 'api',
    OriginPath: `/${stageName}`,
    CustomOriginConfig: {
      HTTPPort: '80',
      HTTPSPort: '443',
      OriginProtocolPolicy: 'https-only'
    }
  };

  const apiCB = {
    AllowedMethods: [
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT'
    ],
    TargetOriginId: 'api',
    ForwardedValues: {
      QueryString: 'true',
      Headers: WHITELISTED_HEADERS
    },
    ViewerProtocolPolicy: 'allow-all',
    MinTTL: '0',
    MaxTTL: '0',
    DefaultTTL: '0'
  };

  let defaultCB;
  let otherCB;
  let defaultRootObject;
  let CustomErrorResponses;
  if (root === 'assets') {
    delete s3CB.PathPattern; // serve root from s3
    apiCB.PathPattern = 'prod/*'; // serve api from api/
    delete apiOrigin.OriginPath; // do not add trailing prod/ when fwding api
    defaultRootObject = 'index.html';
    defaultCB = s3CB;
    otherCB = apiCB;
    CustomErrorResponses = {
      CustomErrorResponses: [
        {
          ErrorCode: '404',
          ResponsePagePath: '/index.html',
          ResponseCode: '200',
          ErrorCachingMinTTL: '30'
        },
        {
          ErrorCode: '403',
          ResponsePagePath: '/index.html',
          ResponseCode: '200',
          ErrorCachingMinTTL: '30'
        }
      ]
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
      Type: 'AWS::CloudFront::Distribution',
      DependsOn: [templateAPIID(), templateAssetsBucketName()],
      Properties: {
        DistributionConfig: {
          ...aliasesConfig,
          Origins: [s3Origin, apiOrigin],
          Enabled: 'true',
          Comment: '',
          DefaultRootObject: defaultRootObject,
          DefaultCacheBehavior: defaultCB,
          CacheBehaviors: [otherCB],
          PriceClass: 'PriceClass_200',
          ...templateViewerCertificate({
            stageName,
            alias,
            acmCertificateArn,
            skipAcmCertificate
          }),
          ...partialWebACLId(),
          ...CustomErrorResponses
        }
      }
    }
  };
}
