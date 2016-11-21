
import AWS from 'aws-sdk';
import spinner from 'simple-spinner';

import { debug, error, log } from '../logger';

import {
  stackUpload
} from '../libs/stackUpload';

export const AWS_REGION = AWS.config.region;
const defaultCloudFormation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
const getCfn = local => local || defaultCloudFormation;

const SPINNER_DEFAULT_SEQUENCE = ['|'.bold, '/'.bold, '-'.bold, '\\'.bold];
const SPINNER_ERROR_SEQUENCE = ['|'.bold.black.bgRed, '/'.bold.black.bgRed, '-'.bold.black.bgRed, '\\'.bold.black.bgRed];
const SPINNER_SUCCESS_SEQUENCE = ['|'.bold.black.bgGreen, '/'.bold.black.bgGreen, '-'.bold.black.bgGreen, '\\'.bold.black.bgGreen];
spinner.change_sequence(SPINNER_DEFAULT_SEQUENCE);

const SAFE_STACK_POLICY = {
  // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/protect-stack-resources.html
  // DynamoDB tables & S3 Buckets shall not be deleted
  'Statement': [{
    'Effect': 'Deny',
    'Principal': '*',
    'Action': ['Update:Replace', 'Update:Delete'],
    'Resource': '*',
    'Condition': {
      'StringEquals': {
        'ResourceType': [
          'AWS::DynamoDB::Table',
          'AWS::ApiGateway::RestApi',
          'AWS::CloudFront::Distribution',
          'AWS::S3::Bucket'
        ]
      }
    }
  }, {
    'Effect': 'Allow',
    'Principal': '*',
    'Action': 'Update:*',
    'Resource': '*'
  }]
};

const UNSAFE_STACK_POLICY = {
  'Statement': [{
    'Effect': 'Allow',
    'Action': 'Update:*',
    'Principal': '*',
    'Resource': '*'
  }]
};

export function templateStackName ({ appName, stage }) {
  const stageUCFirst = stage
    ? (stage[0].toUpperCase() + stage.substring(1))
    : '';
  return `${appName}${stageUCFirst}`;
}

function checkStackExists ({ stackName, cloudformation }) {
  return new Promise((resolve, reject) => {
    getCfn(cloudformation).describeStacks({
      StackName: stackName
    }, (err, data) => {
      if (err || !data.Stacks.find(s => s.StackName === stackName)) {
        debug('No existing stack found, creating new');
        return resolve(false);
      }
      debug('Updating existing stack');
      return resolve(true);
    });
  });
}

export async function buildStack ({ supportBucketName = null, stackName, cfTemplateJSON, inline = false, cloudformation }) {
  const templateSource = inline
    ? ({
      TemplateBody: cfTemplateJSON
    })
    : ({
      TemplateURL: await stackUpload({ bucketName: supportBucketName, stackBody: cfTemplateJSON, region: getCfn(cloudformation).config.region })
    });
  var params = {
    StackName: stackName,
    Capabilities: ['CAPABILITY_IAM'],
    Parameters: [],
    Tags: [{
      Key: 'createdBy',
      Value: 'danilo'
    }],
    ...templateSource,
    StackPolicyBody: JSON.stringify(SAFE_STACK_POLICY),
    OnFailure: 'DO_NOTHING' // deleted when updating
  };
  return params;
}

async function doCreateChangeSet ({ stackName, cfParams, cloudformation }) {
  var params = {
    ChangeSetName: 'DawsonUserChangeSet' + Date.now(),
    StackName: stackName,
    Capabilities: [
      'CAPABILITY_IAM'
    ],
    TemplateBody: cfParams.TemplateBody,
    TemplateURL: cfParams.TemplateURL
  };
  const result = await getCfn(cloudformation).createChangeSet(params).promise();
  const changeSetId = result.Id;
  let status = null;
  while (status !== 'CREATE_COMPLETE') {
    const description = await getCfn(cloudformation).describeChangeSet({
      ChangeSetName: changeSetId
    }).promise();
    if (description.Status === 'FAILED') {
      if (description.StatusReason.includes('didn\'t contain changes')) {
        // "The submitted information didn\'t contain changes. Submit different information to create a change set."
        return false;
      }
      debug('Cannot crate changeset', description);
      throw new Error('Change Set failed to create');
    } else if (description.Status === 'CREATE_COMPLETE') {
      const debugStr = description.Changes
      .sort((change1, change2) => (
        (change2.ResourceChange.Action + change2.ResourceChange.LogicalResourceId) <
        (change1.ResourceChange.Action + change1.ResourceChange.LogicalResourceId)
        ? 1 : -1))
      .map(change => {
        let color;
        switch (change.ResourceChange.Action) {
          case 'Add':
            color = 'green';
            break;
          case 'Modify':
            color = 'yellow';
            break;
          case 'Remove':
            color = 'red';
            break;
        }
        return `${change.ResourceChange.LogicalResourceId[color]}`;
      }).join(', ');
      log('  resources affected by this update:', debugStr);
    } else {
      // wait and loop
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    status = description.Status;
  }
  return changeSetId;
}

async function doExecuteChangeSet ({ changeSetId, cloudformation }) {
  return await getCfn(cloudformation).executeChangeSet({
    ChangeSetName: changeSetId
  }).promise();
}

export async function createOrUpdateStack ({ stackName, cfParams, dryrun, ignoreNoUpdates = false, cloudformation }) {
  const stackExists = await checkStackExists({ stackName, cloudformation });
  let updateStackResponse;

  try {
    if (stackExists) {
      delete cfParams.OnFailure;
      const changeSetId = await doCreateChangeSet({ stackName, cfParams, cloudformation });
      if (changeSetId) {
        if (dryrun) {
          const changeSetLink = `https://console.aws.amazon.com/cloudformation/home?region=${process.env.AWS_REGION}#/changeset/detail?changeSetId=${changeSetId}`;
          log('*'.yellow, `you have used the --dryrun option, a ChangeSet is ready but I'm not executing it: ${changeSetLink}`);
        } else {
          // only if the ChangeSet has been created successfully
          await doExecuteChangeSet({ changeSetId });
        }
      }
    } else {
      updateStackResponse = await getCfn(cloudformation).createStack(cfParams).promise();
    }
  } catch (err) {
    if (ignoreNoUpdates && err.message.match(/No updates are to be performed/i)) {
      log('This stack does not need any update'.gray);
      return {};
    }
    error('Stack update not accepted:'.bold.red, err.message.red);
    throw err;
  }

  return updateStackResponse;
}

export async function removeStackPolicy ({ stackName, cloudformation }) {
  return await getCfn(cloudformation).setStackPolicy({
    StackName: stackName,
    StackPolicyBody: JSON.stringify(UNSAFE_STACK_POLICY)
  }).promise();
}

export async function restoreStackPolicy ({ stackName, cloudformation }) {
  return await getCfn(cloudformation).setStackPolicy({
    StackName: stackName,
    StackPolicyBody: JSON.stringify(SAFE_STACK_POLICY)
  }).promise();
}

export function getStackOutputs ({ stackName, cloudformation }) {
  return getCfn(cloudformation).describeStacks({ StackName: stackName }).promise()
  .then(data => data.Stacks[0].Outputs);
}

export function getStackResources ({ stackName, cloudformation }) {
  return getCfn(cloudformation).describeStackResources({ StackName: stackName }).promise()
  .then(data => data.StackResources);
}

let LAST_STACK_REASON = '';
export function waitForUpdateCompleted (args) {
  return new Promise(resolve => {
    spinner.start();
    uiPollStackStatusHelper(args, outputs => {
      resolve(outputs);
    });
  });
}
function uiPollStackStatusHelper ({ stackName, cloudformation }, done) {
  getCfn(cloudformation).describeStacks({
    StackName: stackName
  }, (err, data) => {
    if (err) {
      error('Cannot call describeStacks', err.message);
      throw err;
    }
    const status = data.Stacks[0].StackStatus;
    const reason = data.Stacks[0].StackStatusReason;
    if (reason) { LAST_STACK_REASON = reason; }
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
      spinner.change_sequence(SPINNER_ERROR_SEQUENCE);
      setTimeout(() => uiPollStackStatusHelper(...arguments), 1000);
      return;
    }
    if (action === 'wait_ok') {
      spinner.change_sequence(SPINNER_SUCCESS_SEQUENCE);
      setTimeout(() => uiPollStackStatusHelper(...arguments), 1000);
      return;
    }
    if (action === 'error') {
      spinner.stop();
      error(`\nStack update failed:`, LAST_STACK_REASON);
      error(`You may inspect stack events:\n$ AWS_DEFAULT_REGION=${getCfn(cloudformation).config.region} aws cloudformation describe-stack-events --stack-name ${stackName} --query "StackEvents[?ResourceStatus == 'UPDATE_FAILED'].{ resource: LogicalResourceId, message: ResourceStatusReason, properties: ResourceProperties }"`);
      return;
    }
    if (action === 'succeed') {
      spinner.stop();
      debug(`\nStack update completed!`);
      done(data.Stacks[0].Outputs);
      return;
    }
  });
}
