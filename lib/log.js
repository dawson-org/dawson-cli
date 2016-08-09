
require('colors');
import moment from 'moment';
import promisify from 'es6-promisify';
import indentString from 'indent-string';
import prettyjson from 'prettyjson';
import AWS from 'aws-sdk';
const cwlogs = new AWS.CloudWatchLogs({});
const filterLogEvents = promisify(cwlogs.filterLogEvents.bind(cwlogs));

import { title, error, log } from './logger';
import { SETTINGS } from './config';
const { appName } = SETTINGS;

import {
  templateLambdaName
} from './cf_lambda';

import {
  getStackResources,
  templateStackName
} from './cf_utils';

const stripNewLines = str => str.replace(/\n$/, ' ');

export function run (argv) {
  const { functionName, limit, requestId: filterRequestId } = argv;
  const stackName = templateStackName({ appName });
  const camelFunctionName = functionName[0].toUpperCase() + functionName.substring(1);
  const cfLambdaName = templateLambdaName({ lambdaName: camelFunctionName });
  return Promise.resolve()
  .then(() => getStackResources({ stackName }))
  .then(resources => {
    const innerStackResourceId = resources.find(o =>
      o.ResourceType === 'AWS::CloudFormation::Stack' && o.LogicalResourceId === 'InnerStack'
    ).PhysicalResourceId;
    return getStackResources({ stackName: innerStackResourceId });
  })
  .then(resources => {
    const awsLambdaResource = resources.find(o =>
      o.ResourceType === 'AWS::Lambda::Function' && o.LogicalResourceId === cfLambdaName
    );
    if (!awsLambdaResource) {
      const errMsg = 'Lambda function with given name does not exist or has not been deployed yet';
      error(errMsg);
      return Promise.reject(errMsg);
    }
    const awsLambdaName = awsLambdaResource.PhysicalResourceId;
    log(`Tailing logs for Lambda '${awsLambdaName}'`);
    return awsLambdaName;
  })
  .then(awsLambdaName => {
    const filter = filterRequestId ? { filterPattern: `"${filterRequestId}"` } : {};
    return filterLogEvents({
      logGroupName: `/aws/lambda/${awsLambdaName}`,
      limit,
      ...filter
      // startTime: 0,
      // endTime: 0,
    });
  })
  .then(({ events }) => {
    title('Date\t\t\tMessage');
    title('-'.repeat(80));
    events.forEach(e => {
      const date = moment(e.timestamp).format('lll');
      let message = stripNewLines(e.message);

      if (message.match(/START RequestId/)) { message = message.green.dim; }
      if (message.match(/END RequestId/)) { message = message.red.dim; }
      if (message.match(/RequestId/)) { message = message.gray; }
      if (message.match(/error/i)) { message = message.red; }

      let msgToPrint;
      if (/^\d\d\d\d\-\d\d\-\d\dT/.test(message)) {
        const requestId = message.substr(25, 36);
        const restMessage = message.substr(62);
        let restMessageColorized;
        try {
          const json = JSON.parse(restMessage);
          restMessageColorized = prettyjson.render(json, {
            keysColor: 'cyan',
            dashColor: 'white',
            stringColor: 'white'
          });
        } catch (e) {
          restMessageColorized = restMessage;
        }
        msgToPrint = `\n    ${requestId.bold.cyan}\n${indentString(restMessageColorized, 4)}`;
      } else {
        msgToPrint = message;
      }

      log(`${date.gray}\t${msgToPrint}`);
    });
  })
  .then(() => {
    log('(Log stream ends here)');
  })
  .catch(err => {
    error('Error tailing logs', err.message, err);
  });
}
