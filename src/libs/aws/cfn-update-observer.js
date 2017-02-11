import AWS from 'aws-sdk';
import Observable from 'zen-observable';
import { debug, error } from '../../logger';
import moment from 'moment';
import chalk from 'chalk';
import Table from 'cli-table';
import createError from '../../libs/error';
import { oneLineTrim, stripIndent } from 'common-tags';

let LAST_STACK_REASON = '';
export function promiseForUpdateCompleted (args) {
  const startTimestamp = Date.now();
  return new Promise((resolve, reject) => {
    setTimeout(
      () => {
        uiPollStackStatusHelper(args, startTimestamp, err => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      },
      5000
    );
  });
}
export function observerForUpdateCompleted (args) {
  const startTimestamp = Date.now();
  return new Observable(observer => {
    setTimeout(
      () => {
        uiPollStackStatusHelper(
          args,
          startTimestamp,
          err => {
            if (err) {
              return observer.error(err);
            }
            observer.complete();
          },
          (status, reason) =>
            observer.next(`status: ${status} ${reason ? `(${reason})` : ''}`)
        );
      },
      5000
    );
  });
}
function uiPollStackStatusHelper (
  { stackName },
  startTimestamp,
  done,
  onProgress = () => {}
) {
  const cloudformation = new AWS.CloudFormation({});
  const AWS_REGION = AWS.config.region;
  cloudformation.describeStacks({ StackName: stackName }, (err, data) => {
    if (err) {
      error('Cannot call describeStacks', err.message);
      throw err;
    }
    const status = data.Stacks[0].StackStatus;
    const reason = data.Stacks[0].StackStatusReason;
    onProgress(status, reason);
    if (reason) {
      LAST_STACK_REASON = reason;
    }
    let action = '';
    switch (status) {
      case 'CREATE_IN_PROGRESS':
      case 'UPDATE_IN_PROGRESS':
        action = 'wait';
        break;
      case 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS':
        action = 'wait_ok';
        break;
      case 'CREATE_COMPLETE':
      case 'UPDATE_COMPLETE':
        action = 'succeed';
        break;
      case 'CREATE_FAILED':
      case 'ROLLBACK_FAILED':
      case 'ROLLBACK_COMPLETE':
      case 'DELETE_FAILED':
      case 'DELETE_COMPLETE':
      case 'UPDATE_ROLLBACK_FAILED':
      case 'UPDATE_ROLLBACK_COMPLETE':
        action = 'error';
        break;
      case 'ROLLBACK_IN_PROGRESS':
      case 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS':
      case 'UPDATE_ROLLBACK_IN_PROGRESS':
      case 'DELETE_IN_PROGRESS':
        action = 'wait_error';
        break;
      default:
        throw new Error('Unknown CloudFormation stack status: ' + status);
    }
    if (action === 'wait') {
      setTimeout(() => uiPollStackStatusHelper(...arguments), 1000);
      return;
    }
    if (action === 'wait_error') {
      setTimeout(() => uiPollStackStatusHelper(...arguments), 1000);
      return;
    }
    if (action === 'wait_ok') {
      setTimeout(() => uiPollStackStatusHelper(...arguments), 1000);
      return;
    }
    if (action === 'error') {
      error(`\nStack update failed:`, LAST_STACK_REASON, status, reason);
      cloudformation
        .describeStackEvents({ StackName: stackName })
        .promise()
        .then(describeResult => {
          const failedEvents = describeResult.StackEvents
            .filter(e => e.Timestamp >= startTimestamp)
            .filter(e => e.ResourceStatus.includes('FAILED'))
            .map(e => [
              moment(e.Timestamp).fromNow(),
              e.ResourceStatus || '',
              e.ResourceStatusReason || '',
              e.LogicalResourceId || ''
            ]);
          const table = new Table({
            head: ['Timestamp', 'Status', 'Reason', 'Logical Id']
          });
          table.push(...failedEvents);
          if (describeResult.StackEvents[0]) {
            error();
          }
          done(createError({
            kind: 'Stack update failed',
            reason: 'The stack update has failed because of an error',
            detailedReason: (
                table.toString() +
                  '\n' +
                  chalk.gray(
                    oneLineTrim`
                You may further inspect stack events from the console at this link:
                https://${AWS_REGION}.console.aws.amazon.com/cloudformation/home
                ?region=${AWS_REGION}#/stacks?tab=events
                  &stackId=${encodeURIComponent(
                      describeResult.StackEvents[0].StackId
                    )}
              `
                  )
              ),
            solution: (
                stripIndent`
            This usually happens because:
            * you have introduced an error when extending your template using 'customTemplateFragment'
            * the 'domain' you specified as cloudfront CNAME is already being used
            * you have reached a limit on your AWS Account (https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html)
            * you are trying to deploy to an unsupported region (https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/)
          `
              )
          }));
          return;
        });
    }
    if (action === 'succeed') {
      debug(`\nStack update completed!`);
      done(null, data.Stacks[0].Outputs);
      return;
    }
  });
}
