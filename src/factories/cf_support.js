
import { debug } from '../logger';
import {
  buildStack,
  createOrUpdateStack,
  waitForUpdateCompleted
} from './cf_utils';

import AWS from 'aws-sdk';

export function templateSupportBucket () {
  return `BucketSupport`;
}

export async function createSupportResources ({ stackName }) {
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
      }
    },
    'Outputs': {
      'SupportBucket': {
        Value: { Ref: `${templateSupportBucket()}` }
      }
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
