
import test from 'tape';

import {
  templateCWEventRuleName,
  templateCWEventInvokeLambdaNamePermission,
  templateCWEventRule
} from './cf_cloudwatch';

test('TemplateCWEventRuleName', t => {
  const expected = 'CWEventRuleMyLambdaName';
  const actual = templateCWEventRuleName({ lambdaName: 'MyLambdaName' });
  t.equal(actual, expected, 'should return lambda name prefixed by CWEventRule');
  t.end();
});

test('TemplateCWEventRulePermissionName', t => {
  const expected = 'CWEventPermMyLambdaName';
  const actual = templateCWEventInvokeLambdaNamePermission({ lambdaName: 'MyLambdaName' });
  t.equal(actual, expected, 'should return lambda name prefixed by CWEventRule');
  t.end();
});

test('TemplateCWEventRuleAndLambdaPermission', t => {
  const expected = {
    'CWEventRuleMyLambdaName': {
      'Type': 'AWS::Events::Rule',
      'Properties': {
        'ScheduleExpression': 'rate(2 minutes)',
        'State': 'ENABLED',
        'Targets': [{
          'Arn': { 'Fn::GetAtt': ['LambdaMyLambdaName', 'Arn'] },
          'Id': `dawson-LambdaMyLambdaName-keep-warm`
        }]
      }
    },
    'CWEventPermMyLambdaName': {
      'Type': 'AWS::Lambda::Permission',
      'Properties': {
        'FunctionName': { 'Ref': 'LambdaMyLambdaName' },
        'Action': 'lambda:InvokeFunction',
        'Principal': 'events.amazonaws.com',
        'SourceArn': { 'Fn::GetAtt': ['CWEventRuleMyLambdaName', 'Arn'] }
      }
    }
  };
  const actual = templateCWEventRule({ lambdaName: 'MyLambdaName' });
  t.deepEqual(actual, expected, 'should return a CloudWatch Event Rule and Lambda Permission template');
  t.end();
});
