
import { SETTINGS } from '../config';
const { appName } = SETTINGS;

import { debug, error } from '../logger';
import { assetsUpload } from '../libs/assetsUpload';

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

export function run () {
  const stackName = templateStackName({ appName });
  return Promise.resolve()
  .then(() => getStackOutputs({ stackName }))
  .then(outputs => {
    const bucketNameOutput = outputs.find(o => o.OutputKey === 'S3AssetsBucket');
    if (!bucketNameOutput) {
      error('You must deploy your app first');
      return Promise.reject(new Error('You must deploy your app first'));
    }
    const bucketName = bucketNameOutput.OutputValue;
    return assetsUpload({ bucketName });
  })
  .then(() => {
    debug('Done!');
  })
  .catch(err => {
    error('Error uploading assets', err.message, err);
  });
}
