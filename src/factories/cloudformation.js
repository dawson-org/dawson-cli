export const SAFE_STACK_POLICY = {
  // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/protect-stack-resources.html
  // DynamoDB tables & S3 Buckets shall not be deleted
  Statement: [
    {
      Effect: 'Deny',
      Principal: '*',
      Action: ['Update:Replace', 'Update:Delete'],
      Resource: '*',
      Condition: {
        StringEquals: {
          ResourceType: [
            'AWS::DynamoDB::Table',
            'AWS::ApiGateway::RestApi',
            'AWS::CloudFront::Distribution',
            'AWS::S3::Bucket'
          ]
        }
      }
    },
    { Effect: 'Allow', Principal: '*', Action: 'Update:*', Resource: '*' }
  ]
};

export const UNSAFE_STACK_POLICY = {
  Statement: [
    { Effect: 'Allow', Action: 'Update:*', Principal: '*', Resource: '*' }
  ]
};

export function templateStackName ({ appName, stage }) {
  const stageUCFirst = stage ? stage[0].toUpperCase() + stage.substring(1) : '';
  return `${appName}${stageUCFirst}`;
}

export function buildCreateStackParams (
  { stackName, cfTemplateJSON, templateURL, inline = false }
) {
  if (inline === false && !templateURL) {
    throw new Error(`Internal error: templateUrl is required when calling buildCreateStackParams with inline === false`);
  }
  if (inline === true && !cfTemplateJSON) {
    throw new Error(`Internal error: cfTemplateJSON is required when calling buildCreateStackParams with inline === true`);
  }
  const templateSource = inline
    ? { TemplateBody: cfTemplateJSON }
    : { TemplateURL: templateURL };
  var params = {
    StackName: stackName,
    Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
    Tags: [{ Key: 'createdBy', Value: 'dawson' }],
    ...templateSource,
    StackPolicyBody: JSON.stringify(SAFE_STACK_POLICY),
    OnFailure: 'DO_NOTHING' // deleted when updating
  };
  return params;
}
