import AWS from 'aws-sdk';
import indentString from 'indent-string';
import moment from 'moment';
import prettyjson from 'prettyjson';

import { error, log, title } from '../logger';
import loadConfig from '../config';

import { templateLambdaName } from '../factories/cf_lambda';

import { templateStackName } from '../factories/cloudformation';
import { getStackResources } from '../libs/aws/cfn-get-stack-info-helpers';

const stripNewLines = str => str.replace(/\n$/, ' ');

export function filterAndPrint (
  awsLambdaName,
  params,
  startTime = 0,
  follow = false
) {
  let lastTimestamp = startTime;
  const { requestId, limit } = params;

  return Promise.resolve()
    .then(() => {
      const filter = requestId ? { filterPattern: `"${requestId}"` } : {};
      const cwlogs = new AWS.CloudWatchLogs({});
      return cwlogs
        .filterLogEvents({
          logGroupName: `/aws/lambda/${awsLambdaName}`,
          limit,
          ...filter,
          startTime
        })
        .promise();
    })
    .then(({ events }) => {
      if (startTime === 0) {
        title('Date\t\t\tMessage');
        title('-'.repeat(80));
      }
      events.forEach(e => {
        const date = moment(e.timestamp).format('lll');
        let message = stripNewLines(e.message);

        if (message.match(/START RequestId/)) {
          message = message.green.dim;
        }
        if (message.match(/END RequestId/)) {
          message = message.red.dim;
        }
        if (message.match(/RequestId/)) {
          message = message.gray;
        }
        if (message.match(/error/i)) {
          message = message.red;
        }

        let msgToPrint;
        if (/^\d\d\d\d-\d\d-\d\dT/.test(message)) {
          const messageRequestId = message.substr(25, 36);
          const restMessage = message.substr(62);
          let restMessageColorized;
          try {
            const json = JSON.parse(restMessage);
            restMessageColorized = prettyjson.render(json, {
              keysColor: 'cyan',
              dashColor: 'white',
              stringColor: 'white'
            });
          } catch (jsonParseError) {
            restMessageColorized = restMessage;
          }
          msgToPrint = `\n    ${messageRequestId.bold.cyan}\n${indentString(restMessageColorized, 4)}`;
        } else {
          msgToPrint = message;
        }

        log(`${date.gray}\t${msgToPrint}`);
        lastTimestamp = e.timestamp + 1;
      });

      if (follow) {
        setTimeout(
          () => filterAndPrint(awsLambdaName, params, lastTimestamp, follow),
          2000
        );
      } else {
        log('(Log stream ends here)');
      }
    });
}

export function run (argv) {
  const { APP_NAME } = loadConfig();
  const { stage, functionName, follow } = argv;
  const stackName = templateStackName({ appName: APP_NAME, stage });
  const camelFunctionName = functionName[0].toUpperCase() +
    functionName.substring(1);
  const cfLambdaName = templateLambdaName({ lambdaName: camelFunctionName });
  return Promise.resolve()
    .then(() => getStackResources({ stackName }))
    .then(resources => {
      const awsLambdaResource = resources.find(
        o =>
          o.ResourceType === 'AWS::Lambda::Function' &&
          o.LogicalResourceId === cfLambdaName
      );
      if (!awsLambdaResource) {
        const errMsg = 'Lambda function with this name does not exist or it has not been deployed yet';
        error(errMsg);
        return Promise.reject(errMsg);
      }
      const awsLambdaName = awsLambdaResource.PhysicalResourceId;
      log(`Tailing logs for Lambda '${awsLambdaName}'`);
      return awsLambdaName;
    })
    .then(awsLambdaName => {
      return filterAndPrint(
        awsLambdaName,
        argv,
        Date.now() - 3600 * 1000,
        follow
      );
    })
    .catch(err => {
      error(
        `Error tailing logs for this function. This probabily means that this function has never been executed or its log has not been delivered yet (AWS Error: '${err.message}')`
      );
    });
}
