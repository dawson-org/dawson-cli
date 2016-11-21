
import { error, log, table, title } from '../logger';
import { APP_NAME } from '../config';

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

export function run (argv) {
  const {
    stage,
    outputName
  } = argv;
  const stackName = templateStackName({ appName: APP_NAME, stage });
  return Promise.resolve()
  .then(() => getStackOutputs({ stackName }))
  .then(outputs => {
    if (typeof outputName === 'undefined') {
      title('Stack outputs');
      log('Please', 'do not copy-paste'.underline, 'OutputValue into your functions. These values are available from the params.stageVariables.<OutputKey> in every lambda function.\n');
      table(outputs);
    } else {
      const found = outputs.find(output => output.OutputKey === outputName);
      if (found) {
        process.stdout.write(found.OutputValue);
      } else {
        log('*'.red, `Output ${outputName} not found`);
      }
    }
  })
  .catch(err => error('Command error', err));
}
