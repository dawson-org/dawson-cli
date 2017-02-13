import AWS from 'aws-sdk';
import { debug, error } from '../../logger';

function checkStackExists ({ stackName }) {
  return new Promise((resolve, reject) => {
    const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
    cloudformation.describeStacks({ StackName: stackName }, (err, data) => {
      if (err || !data.Stacks.find(s => s.StackName === stackName)) {
        debug('No existing stack found, creating new');
        return resolve(false);
      }
      debug('Updating existing stack');
      return resolve(true);
    });
  });
}

export default (async function createOrUpdateStack (
  { stackName, cfParams, dryrun, ignoreNoUpdates = false }
) {
  const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
  const stackExists = await checkStackExists({ stackName });
  let updateStackResponse;

  try {
    if (stackExists) {
      delete cfParams.OnFailure;
      updateStackResponse = await cloudformation
        .updateStack(cfParams)
        .promise();
    } else {
      updateStackResponse = await cloudformation
        .createStack(cfParams)
        .promise();
    }
  } catch (err) {
    if (
      ignoreNoUpdates && err.message.match(/No updates are to be performed/i)
    ) {
      debug('This stack does not need any update'.gray);
      return false;
    }
    error('Stack update not accepted:'.bold.red, err.message.red);
    throw err;
  }

  return updateStackResponse;
});
