
import test from 'tape';

import {
  templateLambdaRoleName,
  templateLambdaName,
  templateLambdaExecutionRole,
  templateLambda
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
              'Service': ['lambda.amazonaws.com']
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
                'Action': ['logs:*'],
                'Resource': 'arn:aws:logs:*:*:*'
              }, {
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
              'Service': ['lambda.amazonaws.com']
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
                'Action': ['logs:*'],
                'Resource': 'arn:aws:logs:*:*:*'
              }
            ]
          }
        }]
      }
    },
    LambdaMyFunction: {
      'Type': 'AWS::Lambda::Function',
      'Properties': {
        'Handler': 'daniloindex.handler',
        'Role': { 'Fn::GetAtt': ['ExecutionRoleForLambdaMyFunction', 'Arn'] },
        'Code': {
          S3Bucket: 'demobucket',
          S3Key: 'demokey',
          S3ObjectVersion: 'demoversion'
        },
        'Runtime': 'foobar',
        'MemorySize': 1024,
        'Timeout': 30
      }
    }
  };
  const actual = templateLambda({
    lambdaName: 'MyFunction',
    zipS3Location: { Bucket: 'demobucket', Key: 'demokey', VersionId: 'demoversion' },
    runtime: 'foobar',
    policyStatements: []
  });
  t.deepEqual(actual, expected, 'should return a lambda template');
  t.end();
});
