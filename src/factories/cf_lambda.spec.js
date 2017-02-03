import test from 'ava';

import { templateLambda, templateLambdaExecutionRole } from './cf_lambda';

test('templateLambdaExecutionRole', t => {
  const expected = {
    ExecutionRoleForLambdaMyLambda: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: ['lambda.amazonaws.com'],
                AWS: [{'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root'}] // eslint-disable-line
              },
              Action: ['sts:AssumeRole']
            }
          ]
        },
        Path: '/',
        Policies: [
          {
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
                { Effect: 'Deny', Action: '*', Resource: '*' }
              ]
            }
          }
        ]
      }
    }
  };
  const actual = templateLambdaExecutionRole({
    lambdaName: 'MyLambda',
    policyStatements: [{ Effect: 'Deny', Action: '*', Resource: '*' }]
  });
  t.deepEqual(
    actual,
    expected,
    'should return an execution role with the specified statements'
  );
});

test('templateLambda', t => {
  const expected = {
    ExecutionRoleForLambdaMyFunction: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                AWS: [{ 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root' }],
                Service: ['lambda.amazonaws.com']
              },
              Action: ['sts:AssumeRole']
            }
          ]
        },
        Path: '/',
        Policies: [
          {
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
                { Effect: 'Deny', Action: '*', Resource: '*' }
              ]
            }
          }
        ]
      }
    },
    LambdaMyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Handler: `dawsonindex.myFunction`,
        Role: { 'Fn::GetAtt': ['ExecutionRoleForLambdaMyFunction', 'Arn'] },
        Code: {
          S3Bucket: 'demobucket',
          S3Key: 'demokey',
          S3ObjectVersion: 'demoversion'
        },
        Runtime: 'foobar',
        MemorySize: 1024,
        Timeout: 30,
        Environment: { Variables: { DAWSON_myBar: 'baz', NODE_ENV: 'development' } }
      }
    },
    PermissionForLambdaMyFunction: {
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: { 'Fn::Sub': '${LambdaMyFunction.Arn}' },
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Sub': 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${API}/prod*'
        }
      },
      Type: 'AWS::Lambda::Permission'
    }
  };
  const actual = templateLambda({
    lambdaName: 'MyFunction',
    handlerFunctionName: 'myFunction',
    zipS3Location: {
      Bucket: 'demobucket',
      Key: 'demokey',
      VersionId: 'demoversion'
    },
    runtime: 'foobar',
    policyStatements: [{ Effect: 'Deny', Action: '*', Resource: '*' }],
    environment: { myBar: 'baz' }
  });
  t.deepEqual(expected, actual, 'should return a lambda template');
});

test('templateLambda in production', t => {
  const expected = {
    ExecutionRoleForLambdaMyFunction: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: ['lambda.amazonaws.com'] },
              Action: ['sts:AssumeRole']
            }
          ]
        },
        Path: '/',
        Policies: [
          {
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
                { Effect: 'Deny', Action: '*', Resource: '*' }
              ]
            }
          }
        ]
      }
    },
    LambdaMyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Handler: `dawsonindex.myFunction`,
        Role: { 'Fn::GetAtt': ['ExecutionRoleForLambdaMyFunction', 'Arn'] },
        Code: {
          S3Bucket: 'demobucket',
          S3Key: 'demokey',
          S3ObjectVersion: 'demoversion'
        },
        Runtime: 'foobar',
        MemorySize: 1024,
        Timeout: 30,
        Environment: { Variables: { DAWSON_myBar: 'baz', NODE_ENV: 'production' } }
      }
    },
    PermissionForLambdaMyFunction: {
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: { 'Fn::Sub': '${LambdaMyFunction.Arn}' },
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Sub': 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${API}/prod*'
        }
      },
      Type: 'AWS::Lambda::Permission'
    }
  };
  const oldEnv = `${process.env.NODE_ENV || ''}`;
  process.env.NODE_ENV = 'production';
  const actual = templateLambda({
    lambdaName: 'MyFunction',
    handlerFunctionName: 'myFunction',
    zipS3Location: {
      Bucket: 'demobucket',
      Key: 'demokey',
      VersionId: 'demoversion'
    },
    runtime: 'foobar',
    policyStatements: [{ Effect: 'Deny', Action: '*', Resource: '*' }],
    environment: { myBar: 'baz' }
  });
  process.env.NODE_ENV = oldEnv;
  t.deepEqual(actual, expected, 'should return a lambda template');
});

test('templateLambda with inline codes', t => {
  const expected = {
    ExecutionRoleForLambdaMyFunction: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                AWS: [{ 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root' }],
                Service: ['lambda.amazonaws.com']
              },
              Action: ['sts:AssumeRole']
            }
          ]
        },
        Path: '/',
        Policies: [
          {
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
                }
              ]
            }
          }
        ]
      }
    },
    LambdaMyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Handler: `dawsonindex.myFunction`,
        Role: { 'Fn::GetAtt': ['ExecutionRoleForLambdaMyFunction', 'Arn'] },
        Code: {
          ZipFile: "module.exports.handler = (event, context, callback) => { callback(null, 'Hooray'); }"
        },
        Runtime: 'nodejs4.3',
        MemorySize: 1024,
        Timeout: 30,
        Environment: { Variables: { NODE_ENV: 'development' } }
      }
    },
    PermissionForLambdaMyFunction: {
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: { 'Fn::Sub': '${LambdaMyFunction.Arn}' },
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Sub': 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${API}/prod*'
        }
      },
      Type: 'AWS::Lambda::Permission'
    }
  };
  const actual = templateLambda({
    lambdaName: 'MyFunction',
    handlerFunctionName: 'myFunction',
    inlineCode: (
      `module.exports.handler = (event, context, callback) => { callback(null, 'Hooray'); }`
    )
  });
  t.deepEqual(expected, actual, 'should return a lambda template');
});
