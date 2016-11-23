
import { sortBy } from 'lodash';

import { error, log, title } from '../logger';
import { APP_NAME } from '../config';

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

export function run (argv) {
  const {
    stage,
    outputName,
    shell = false
  } = argv;
  const stackName = templateStackName({ appName: APP_NAME, stage });
  return Promise.resolve()
  .then(() => getStackOutputs({ stackName }))
  .then(outputs => {
    if (typeof outputName !== 'undefined') {
      const found = outputs.find(output => output.OutputKey === outputName);
      if (found) {
        process.stdout.write(found.OutputValue);
      } else {
        log('*'.red, `Output ${outputName} not found`);
      }
      return;
    }

    if (!shell) {
      title('Stack outputs');
      log('Please do not copy-paste OutputValue into your functions. These values are available from the params.stageVariables.<OutputKey> in every lambda function.\n'.yellow.dim);
    }

    const outputValues = Object.values(outputs);
    const sortedOutputs = sortBy(outputValues, ['OutputKey']);
    sortedOutputs.forEach(({ OutputKey, OutputValue }) => {
      if (shell) {
        process.stdout.write(`${OutputKey}=${OutputValue}\n`);
      } else {
        log(`${OutputKey}`.cyan.bold, '\t', `${OutputValue}`);
      }
    });
  })
  .catch(err => error('Command error', err));
}
