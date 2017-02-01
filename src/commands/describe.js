import Table from 'cli-table';
import { sortBy } from 'lodash';

import loadConfig from '../config';
import { error, log, title } from '../logger';
import {
  getStackOutputs,
  getStackResources,
  templateStackName
} from '../libs/cloudformation';

export function run (argv) {
  const { APP_NAME } = loadConfig();
  const { stage, outputName, resourceId, shell = false } = argv;
  const stackName = templateStackName({ appName: APP_NAME, stage });
  return Promise
    .all([getStackOutputs({ stackName }), getStackResources({ stackName })])
    .then(([outputs, resources]) => {
      if (typeof outputName !== 'undefined') {
        const foundOutput = outputs.find(
          output => output.OutputKey === outputName
        );
        if (foundOutput) {
          process.stdout.write(foundOutput.OutputValue);
          return;
        } else {
          process.exit(1);
        }
      }
      if (typeof resourceId !== 'undefined') {
        const foundResource = resources.find(
          resource => resource.LogicalResourceId === resourceId
        );
        if (foundResource) {
          process.stdout.write(foundResource.PhysicalResourceId);
          return;
        } else {
          process.exit(1);
        }
      }

      const sortedResources = sortBy(resources, [
        'ResourceType',
        'LogicalResourceId'
      ]);
      if (shell) {
        sortedResources.forEach(({ PhysicalResourceId, LogicalResourceId }) => {
          process.stdout.write(`${LogicalResourceId}=${PhysicalResourceId}\n`);
        });
      } else {
        const table = new Table({
          head: ['LogicalResourceId', 'PhysicalResourceId']
        });
        table.push(
          ...sortedResources.map(({ LogicalResourceId, PhysicalResourceId }) => [
            LogicalResourceId,
            PhysicalResourceId
          ])
        );
        title('Stack Resources');
        console.log(table.toString());
      }

      if (!shell) {
        log('');
      }

      const outputValues = Object.values(outputs);
      const sortedOutputs = sortBy(outputValues, ['OutputKey']);
      if (shell) {
        sortedOutputs.forEach(({ OutputKey, OutputValue }) => {
          process.stdout.write(`${OutputKey}=${OutputValue}\n`);
        });
      } else {
        const table = new Table({ head: ['OutputKey', 'OutputValue'] });
        table.push(
          ...sortedOutputs.map(({ OutputKey, OutputValue }) => [
            OutputKey,
            OutputValue
          ])
        );
        title('Stack Outputs');
        log(
          'Please do not copy-paste any OutputValue into your functions. These values are available from the params.stageVariables.<OutputKey> in every lambda function.'.yellow.dim
        );
        console.log(table.toString());
      }
    })
    .catch(err => error('Command error', err));
}
