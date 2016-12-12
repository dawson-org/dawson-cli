
import { test } from 'tap';

import {
  templateLambda,
  templateLambdaExecutionRole,
  templateLambdaName,
  templateLambdaRoleName
} from './cf_lambda';

test('templateLambdaRoleName', t => {
  const expected = 'ExecutionRoleForLambdaMyLambda';
  const actual = templateLambdaRoleName({ lambdaName: 'MyLambda' });
  t.equal(actual, expected, 'should return lambda name prefixed by ExecutionRoleFor');
  t.end();
});

test('templateLambdaName', t => {
  const expected = 'LambdaMyFunction';
  const actual = templateLambdaName({ lambdaName: 'MyFunction' });
  t.equal(actual, expected, 'shoudl return lambda name suffixed by Lambda');
  t.end();
});

test('templateLambdaExecutionRole', t => {
  const expected = {
    ExecutionRoleForLambdaMyLambda: {
      'Type': 'AWS::IAM::Role',
      'Properties': {
        'AssumeRolePolicyDocument': {
          'Version': '2012-10-17',
          'Statement': [{
            'Effect': 'Allow',
            'Principal': {
              'Service': ['lambda.amazonaws.com'],
              'AWS': [{ 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root' }] // eslint-disable-line
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
              {
                Effect: 'Deny',
                Action: '*',
                Resource: '*'
              }
            ]
          }
        }]
      }
    }
  };
  const actual = templateLambdaExecutionRole({
    lambdaName: 'MyLambda',
    policyStatements: [{
      Effect: 'Deny',
      Action: '*',
      Resource: '*'
    }]
  });
  t.deepEqual(actual, expected, 'should return an execution role with the specified statements');
  t.end();
});

test('templateLambda', t => {
  const expected = {
    ExecutionRoleForLambdaMyFunction: {
      'Type': 'AWS::IAM::Role',
      'Properties': {
        'AssumeRolePolicyDocument': {
          'Version': '2012-10-17',
          'Statement': [{
            'Effect': 'Allow',
            'Principal': {
              'Service': ['lambda.amazonaws.com'],
              'AWS': [{ 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root' }] // eslint-disable-line
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
              }
            ]
          }
        }]
      }
    },
    LambdaMyFunction: {
      'Type': 'AWS::Lambda::Function',
      'Properties': {
        'Handler': `dawsonindex.myFunction`,
        'Role': { 'Fn::GetAtt': ['ExecutionRoleForLambdaMyFunction', 'Arn'] },
        'Code': {
          S3Bucket: 'demobucket',
          S3Key: 'demokey',
          S3ObjectVersion: 'demoversion'
        },
        'Runtime': 'foobar',
        'MemorySize': 1024,
        'Timeout': 30,
        'Environment': {
          'Variables': {
            'DAWSON_myBar': 'baz'
          }
        }
      }
    }
  };
  const actual = templateLambda({
    lambdaName: 'MyFunction',
    handlerFunctionName: 'myFunction',
    zipS3Location: { Bucket: 'demobucket', Key: 'demokey', VersionId: 'demoversion' },
    runtime: 'foobar',
    policyStatements: [],
    environment: {
      'myBar': 'baz'
    }
  });
  t.deepEqual(actual, expected, 'should return a lambda template');
  t.end();
});
