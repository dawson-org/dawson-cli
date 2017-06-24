import { debug } from '../logger';

import { templateSupportStack } from '../factories/cf_support';
import {
  templateStackName,
  buildCreateStackParams
} from '../factories/cloudformation';

import { promiseForUpdateCompleted } from '../libs/aws/cfn-update-observer';
import { getStackOutputs } from '../libs/aws/cfn-get-stack-info-helpers';
import createOrUpdateStack from '../libs/aws/cfn-create-or-update-stack';

export default async function taskUpdateSupportStack ({ appStage, appName }) {
  const stackName = templateStackName({ appName: `${appName}Support` });
  const cfTemplate = templateSupportStack();
  const cfTemplateJSON = JSON.stringify(cfTemplate, null, 2);
  const cfParams = buildCreateStackParams({
    stackName,
    cfTemplateJSON,
    inline: true // support bucket does not exist ad this time
  });
  const response = await createOrUpdateStack({
    stackName,
    cfParams,
    ignoreNoUpdates: true
  });
  if (response === false) {
    debug(`Support Stack doesn't need any update`);
  } else {
    await promiseForUpdateCompleted({ stackName });
    debug(`Support Stack update completed`);
  }
  const supportOutputs = await getStackOutputs({ stackName });
  const supportBucketName = supportOutputs.find(
    o => o.OutputKey === 'SupportBucket'
  ).OutputValue;
  return { supportBucketName };
}
