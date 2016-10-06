
import {
  templateLambdaName
} from './cf_lambda';

export function templateCWEventRuleName ({ lambdaName }) {
  return `CWEventRule${lambdaName}`;
}

export function templateCWEventInvokeLambdaNamePermission ({ lambdaName }) {
  return `CWEventPerm${lambdaName}`;
}

function templateCWEventRulePermission ({ lambdaName }) {
  return {
    [`${templateCWEventInvokeLambdaNamePermission({ lambdaName })}`]: {
      'Type': 'AWS::Lambda::Permission',
      'Properties': {
        'FunctionName': { 'Ref': templateLambdaName({ lambdaName }) },
        'Action': 'lambda:InvokeFunction',
        'Principal': 'events.amazonaws.com',
        'SourceArn': { 'Fn::GetAtt': [templateCWEventRuleName({ lambdaName }), 'Arn'] }
      }
    }
  };
}

export function templateCWEventRule ({ lambdaName }) {
  return {
    [`${templateCWEventRuleName({ lambdaName })}`]: {
      'Type': 'AWS::Events::Rule',
      'Properties': {
        'ScheduleExpression': 'rate(2 minutes)',
        'State': 'ENABLED',
        'Targets': [{
          'Arn': { 'Fn::GetAtt': [`${templateLambdaName({ lambdaName })}`, 'Arn'] },
          'Id': `dawson-${templateLambdaName({ lambdaName })}-keep-warm`
        }]
      }
    },
    ...templateCWEventRulePermission({ lambdaName })
  };
}
