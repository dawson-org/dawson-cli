import AWS from 'aws-sdk';

import {
  SAFE_STACK_POLICY,
  UNSAFE_STACK_POLICY
} from '../../factories/cloudformation';

export async function removeStackPolicy ({ stackName }) {
  const cloudformation = new AWS.CloudFormation({});
  return await cloudformation
    .setStackPolicy({
      StackName: stackName,
      StackPolicyBody: JSON.stringify(UNSAFE_STACK_POLICY)
    })
    .promise();
}

export async function restoreStackPolicy ({ stackName }) {
  const cloudformation = new AWS.CloudFormation({});
  return await cloudformation
    .setStackPolicy({
      StackName: stackName,
      StackPolicyBody: JSON.stringify(SAFE_STACK_POLICY)
    })
    .promise();
}
