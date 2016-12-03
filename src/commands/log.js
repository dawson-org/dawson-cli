
import AWS from 'aws-sdk';
import indentString from 'indent-string';
import moment from 'moment';
import prettyjson from 'prettyjson';
import promisify from 'es6-promisify';

const cwlogs = new AWS.CloudWatchLogs({});
const filterLogEvents = promisify(cwlogs.filterLogEvents.bind(cwlogs));

import { title, error, log } from '../logger';
import loadConfig from '../config';

import {
  templateLambdaName
} from '../factories/cf_lambda';

import {
  getStackResources,
  templateStackName
} from '../factories/cf_utils';

const stripNewLines = str => str.replace(/\n$/, ' ');

export function filterAndPrint (awsLambdaName, params, startTime = 0, follow = false) {
  let lastTimestamp = startTime;
  const {
    requestId,
    limit
  } = params;

  return Promise.resolve()
  .then(() => {
    const filter = requestId ? { filterPattern: `"${requestId}"` } : {};
    return filterLogEvents({
      logGroupName: `/aws/lambda/${awsLambdaName}`,
      limit,
      ...filter,
      startTime
    });
  })
  .then(({ events }) => {
    if (startTime === 0) {
      title('Date\t\t\tMessage');
      title('-'.repeat(80));
    }
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
      lastTimestamp = e.timestamp + 1;
    });

    if (follow) {
      setTimeout(() => filterAndPrint(awsLambdaName, params, lastTimestamp, follow), 2000);
    } else {
      log('(Log stream ends here)');
    }
  });
}

export function run (argv) {
  const { APP_NAME } = loadConfig();
  const {
    stage,
    functionName,
    follow
  } = argv;
  const stackName = templateStackName({ appName: APP_NAME, stage });
  const camelFunctionName = functionName[0].toUpperCase() + functionName.substring(1);
  const cfLambdaName = templateLambdaName({ lambdaName: camelFunctionName });
  return Promise.resolve()
  .then(() => getStackResources({ stackName }))
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
    return filterAndPrint(awsLambdaName, argv, Date.now() - 3600 * 1000, follow);
  })
  .catch(err => {
    error('Error tailing logs', err.message, err);
  });
}
