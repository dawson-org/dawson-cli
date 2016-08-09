
import { SETTINGS } from '../config';
const { appName } = SETTINGS;

import { success, error, title } from '../logger';
import { assetsUpload } from '../libs/assetsUpload';

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

export function run (argv) {
  const {
    stage
  } = argv;

  title('*'.blue, 'uploading assets/ contents...');
  const stackName = templateStackName({ appName, stage });

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
    success('*'.blue, 'done!');
  })
  .catch(err => {
    error('Error uploading assets', err.message, err);
  });
}
