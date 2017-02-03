import AWS from 'aws-sdk';

export function getStackOutputs ({ stackName }) {
  const cloudformation = new AWS.CloudFormation({});
  return cloudformation
    .describeStacks({ StackName: stackName })
    .promise()
    .then(data => data.Stacks[0].Outputs);
}

export function getStackResources ({ stackName }) {
  const cloudformation = new AWS.CloudFormation({});
  return cloudformation
    .describeStackResources({ StackName: stackName })
    .promise()
    .then(data => data.StackResources);
}
