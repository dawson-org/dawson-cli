
import { debug } from './logger';
import {
  templateStackName,
  buildStackParams,
  createOrUpdateStack,
  waitForUpdateCompleted
} from './cf_utils';

export function templateSupportBucket ({ appName }) {
  return `support${appName.toLowerCase()}`;
}

export async function createSupportResources ({ appName }) {
  const stackName = templateStackName({ appName: `${appName}Support` });
  const cfTemplateJSON = JSON.stringify({
    'Resources': {
      [`${templateSupportBucket({ appName })}`]: {
        'Type': 'AWS::S3::Bucket',
        'Properties': {
          'BucketName': `${templateSupportBucket({ appName })}`,
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
    }
  }, null, 2);
  const cfParams = buildStackParams({
    stackName,
    cfTemplateJSON
  });
  debug('Now updating support resources');
  await createOrUpdateStack({ stackName, cfParams, ignoreNoUpdates: true });
  await waitForUpdateCompleted({ stackName });
  debug(`Support Stack update completed`);
}
