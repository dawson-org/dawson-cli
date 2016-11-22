
import { oneLine } from 'common-tags';
import AWS from 'aws-sdk';

import {
  debug,
  warning
} from '../logger';
import {
  buildStack,
  createOrUpdateStack,
  waitForUpdateCompleted
} from './cf_utils';

export function templateSupportBucket () {
  return `BucketSupport`;
}

export function templateACMCertName ({ stageName }) {
  return `ACMCert${stageName[0].toUpperCase()}${stageName.substr(1)}`.replace(/\W+/, '');
}

function templateACMCertificatePartial ({ logicalName, domainName }) {
  return {
    [logicalName]: {
      'Type': 'AWS::CertificateManager::Certificate',
      'Properties': {
        'DomainName': domainName
      }
    }
  };
}

function templateACMCertificates ({ cloudfrontStagesSettings }) {
  let resources = {};
  let outputs = {};
  Object.entries(cloudfrontStagesSettings).forEach(([stageName, domainName]) => {
    if (typeof domainName === 'string') {
      warning(oneLine`
        An SSL/TLS certificate will be requested for the domain ${domainName.bold} and the deploy 
        will pause until you've validated all of your certificates.
        Domain contacts and administrative emails will receive an email asking for confirmation.
        Refer to AWS ACM documentation for further info:
        https://docs.aws.amazon.com/acm/latest/userguide/setup-email.html
      `);
      const logicalName = templateACMCertName({ stageName });
      resources = {
        ...resources,
        ...templateACMCertificatePartial({ logicalName, domainName })
      };
      outputs = {
        ...outputs,
        [`${logicalName}`]: {
          Value: { Ref: logicalName }
        }
      };
    }
  });
  return {
    Resources: resources,
    Outputs: outputs
  };
}

export async function createSupportResources ({ stackName, cloudfrontStagesSettings }) {
  const ACMCertsPartial = templateACMCertificates({ cloudfrontStagesSettings });
  const cfTemplateJSON = JSON.stringify({
    'Resources': {
      [`${templateSupportBucket()}`]: {
        'Type': 'AWS::S3::Bucket',
        'Properties': {
          'LifecycleConfiguration': {
            'Rules': [{
              'Id': 'CleanupAfter7Days',
              'ExpirationInDays': 7,
              'Status': 'Enabled'
            }]
          },
          'VersioningConfiguration': {
            'Status': 'Enabled'
          }
        }
      },
      ...ACMCertsPartial.Resources
    },
    'Outputs': {
      'SupportBucket': {
        Value: { Ref: `${templateSupportBucket()}` }
      },
      ...ACMCertsPartial.Outputs
    }
  }, null, 2);
  // !!! REGION WARNING !!!
  // Support stack is always created in us-east-1 because we can only
  // associate to CloudFront AWS ACM certificates that are located in us-east-1
  const cloudformation = new AWS.CloudFormation({
    region: 'us-east-1'
  });
  const cfParams = await buildStack({
    stackName,
    cfTemplateJSON,
    inline: true, // support bucket does not exist ad this time
    cloudformation
  });
  debug('Now updating support resources in Region');
  await createOrUpdateStack({ stackName, cfParams, ignoreNoUpdates: true, cloudformation });
  await waitForUpdateCompleted({ stackName, cloudformation });
  debug(`Support Stack update completed`);
}
