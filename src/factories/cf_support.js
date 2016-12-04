
import { debug } from '../logger';
import {
  buildStack,
  createOrUpdateStack,
  waitForUpdateCompleted
} from '../libs/cloudfront';

export function templateSupportBucket () {
  return `BucketSupport`;
}

export async function createSupportResources ({ stackName, cloudfrontStagesSettings }) {
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
  const cfParams = await buildStack({
    stackName,
    cfTemplateJSON,
    inline: true // support bucket does not exist ad this time
  });
  debug('Now updating support resources');
  const response = await createOrUpdateStack({ stackName, cfParams, ignoreNoUpdates: true });
  if (response === false) {
    debug(`Support Stack doesn't need any update`);
    return;
  }
  await waitForUpdateCompleted({ stackName });
  debug(`Support Stack update completed`);
}
