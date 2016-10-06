
import { stripIndent } from 'common-tags';

export function templateLambdaRoleName ({ lambdaName }) {
  return `ExecutionRoleForLambda${lambdaName}`;
}

export function templateLambdaName ({ lambdaName }) {
  return `Lambda${lambdaName}`;
}

export function templateLambdaExecutionRole ({
  lambdaName,
  keepWarm = false,
  policyStatements = []
}) {
  const lambdaPrincipalService = ['lambda.amazonaws.com'];
  return {
    [`${templateLambdaRoleName({ lambdaName })}`]: {
      'Type': 'AWS::IAM::Role',
      'Properties': {
        'AssumeRolePolicyDocument': {
          'Version': '2012-10-17',
          'Statement': [{
            'Effect': 'Allow',
            'Principal': {
              'Service': lambdaPrincipalService
            },
            'Action': ['sts:AssumeRole']
          }]
        },
        'Path': '/',
        'Policies': [{
          'PolicyName': 'dawson-policy',
          'PolicyDocument': {
            'Version': '2012-10-17',
            'Statement': [
              {
                'Effect': 'Allow',
                'Action': [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents'
                ],
                'Resource': { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*' } // eslint-disable-line
              },
              {
                'Effect': 'Allow',
                'Action': ['cloudformation:DescribeStacks'],
                'Resource': {
                  'Fn::Join': ['', [
                    'arn:aws:cloudformation:',
                    { 'Ref': 'AWS::Region' },
                    ':',
                    { 'Ref': 'AWS::AccountId' },
                    ':stack/',
                    { 'Ref': 'AWS::StackName' },
                    '/*'
                  ]]
                }
              },
              ...policyStatements
            ]
          }
        }]
      }
    }
  };
}

const LAMBDA_DEMO_INLINE_CODE = stripIndent`
module.exports.handler = function (event, context, callback) {
  console.log('got event', event);
  callback(null, 'Hello from a lambda. Your function has no body, so we have loaded an example snippet :=)');
}
`;

export function templateLambda ({
  lambdaName,
  handlerFunctionName,
  inlineCode = LAMBDA_DEMO_INLINE_CODE,
  zipS3Location = null,
  policyStatements,
  keepWarm = false,
  runtime = 'nodejs4.3'
}) {
  const code = (zipS3Location)
    ? {
      S3Bucket: zipS3Location.Bucket,
      S3Key: zipS3Location.Key,
      S3ObjectVersion: zipS3Location.VersionId
    }
    : { ZipFile: inlineCode };
  return {
    ...templateLambdaExecutionRole({
      lambdaName,
      policyStatements,
      keepWarm
    }),
    [`${templateLambdaName({ lambdaName })}`]: {
      'Type': 'AWS::Lambda::Function',
      'Properties': {
        'Handler': `daniloindex.${handlerFunctionName}`,
        'Role': { 'Fn::GetAtt': [`${templateLambdaRoleName({ lambdaName })}`, 'Arn'] },
        'Code': code,
        'Runtime': runtime,
        'MemorySize': 1024,
        'Timeout': 30
      }
    }
  };
}
