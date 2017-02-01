import { stripIndent } from 'common-tags';

export function templateLambdaRoleName ({ lambdaName }) {
  return `ExecutionRoleForLambda${lambdaName}`;
}

export function templateLambdaName ({ lambdaName }) {
  return `Lambda${lambdaName}`;
}

function extraTrustPrincipals () {
  if (process.env.NODE_ENV === 'production') {
    return {};
  }
  // In envs deployed with NODE_ENV !== production
  // we allow current account identities to assume this role
  // for testing with the development proxy
  // https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Principal
  return {
    AWS: [{'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root'}] // eslint-disable-line
  };
}

export function templatePolicyDocument ({ policyStatements }) {
  return {
    PolicyName: 'dawson-policy',
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          Resource: {
            'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*'
          } // eslint-disable-line
        },
        {
          Effect: 'Allow',
          Action: ['cloudformation:DescribeStacks'],
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:aws:cloudformation:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':stack/',
                { Ref: 'AWS::StackName' },
                '/*'
              ]
            ]
          }
        },
        ...policyStatements
      ]
    }
  };
}

export function templateLambdaExecutionRole (
  { lambdaName, policyStatements = [] }
) {
  return {
    [`${templateLambdaRoleName({ lambdaName })}`]: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: ['lambda.amazonaws.com'],
                ...extraTrustPrincipals()
              },
              Action: ['sts:AssumeRole']
            }
          ]
        },
        Path: '/',
        Policies: [templatePolicyDocument({ policyStatements })]
      }
    }
  };
}

function templateLambdaPermission ({ lambdaName }) {
  const lambdaLogicalName = templateLambdaName({ lambdaName });
  return {
    [`PermissionFor${lambdaLogicalName}`]: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: { 'Fn::Sub': `\x24{${lambdaLogicalName}.Arn}` },
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Sub': 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${API}/prod*' // eslint-disable-line no-template-curly-in-string
        }
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

export function templateLambda (
  {
    lambdaName,
    handlerFunctionName,
    inlineCode = LAMBDA_DEMO_INLINE_CODE,
    zipS3Location = null,
    policyStatements,
    runtime = 'nodejs4.3',
    environment = {}
  }
) {
  const code = zipS3Location
    ? {
      S3Bucket: zipS3Location.Bucket,
      S3Key: zipS3Location.Key,
      S3ObjectVersion: zipS3Location.VersionId
    }
    : { ZipFile: inlineCode };

  const prefixedEnvironment = {};
  Object.keys(environment).forEach(envKey => {
    const prefixedEnvKey = `DAWSON_${envKey}`;
    prefixedEnvironment[prefixedEnvKey] = environment[envKey];
  });
  prefixedEnvironment.NODE_ENV = process.env.NODE_ENV || 'development';

  return {
    ...templateLambdaPermission({ lambdaName }),
    ...templateLambdaExecutionRole({ lambdaName, policyStatements }),
    [`${templateLambdaName({ lambdaName })}`]: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Handler: `dawsonindex.${handlerFunctionName}`,
        Role: {
          'Fn::GetAtt': [`${templateLambdaRoleName({ lambdaName })}`, 'Arn']
        },
        Code: code,
        Runtime: runtime,
        MemorySize: 1024,
        Timeout: 30,
        Environment: { Variables: { ...prefixedEnvironment } }
      }
    }
  };
}
