
import { error, log, table, title } from '../logger';
import { SETTINGS } from '../config';
const { appName } = SETTINGS;

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

export function run (argv) {
  const {
    stage
  } = argv;
  const stackName = templateStackName({ appName, stage });
  return Promise.resolve()
  .then(() => getStackOutputs({ stackName }))
  .then(outputs => {
    title('Stack outputs');
    log('Please', 'do not copy-paste'.underline, 'OutputValue into your functions. These values are available from the params.stageVariables.<OutputKey> in every lambda function.\n');
    table(outputs);
  })
  .catch(err => error('Command error', err));
}
