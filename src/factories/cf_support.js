
import { debug } from '../logger';
import {
  buildStack,
  createOrUpdateStack,
  waitForUpdateCompleted
} from './cf_utils';

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
  const cfParams = await buildStack({
    stackName,
    cfTemplateJSON,
    inline: true // support bucket does not exist ad this time
  });
  debug('Now updating support resources');
  await createOrUpdateStack({ stackName, cfParams, ignoreNoUpdates: true });
  await waitForUpdateCompleted({ stackName });
  debug(`Support Stack update completed`);
}
