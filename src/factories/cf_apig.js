
import assert from 'assert';
import { stripIndent } from 'common-tags';

import {
  templateLambdaName
} from './cf_lambda';

export function templateAPIID () {
  return `API`;
}

export function templateResourceName ({ resourceName }) {
  return `Resource${resourceName}`;
}

export function templateMethodName ({ resourceName = 'Root', httpMethod }) {
  return `Method${resourceName}${httpMethod}`;
}

export function templateStageName ({ stageName }) {
  return `Stage${stageName[0].toUpperCase()}${stageName.slice(1)}`;
}

export function templateDeploymentName ({ deploymentUid }) {
  return `Deployment${deploymentUid}`;
}

export function templateModelName ({ modelName }) {
  return `Model${modelName}`;
}

function templateCloudWatchRoleName () {
  return 'APIGatewayCloudWatchIAMRole';
}

export function templateRest ({ appStage }) {
  return {
    [`${templateAPIID()}`]: {
      'Type': 'AWS::ApiGateway::RestApi',
      'Properties': {
        'Description': `REST API for dawson app`,
        'Name': `AppAPI${appStage[0].toUpperCase()}${appStage.slice(1)}`
      }
    }
  };
}


export function templateResourceHelper ({
  resourcePath
}) {
  const resourcePathTokens = resourcePath.split('/');
  let lastResourceName;
  let templateResourcePartials = {};

  resourcePathTokens.forEach(pathToken => {
    let resourceName;
    if (!pathToken) {
      resourceName = null;
    } else if (pathToken[0] === '{') {
      let pathWithoutBrackets = /\{(.*)\}/.exec(pathToken)[1];
      resourceName = pathWithoutBrackets[0].toUpperCase() + pathWithoutBrackets.substring(1);
    } else {
      resourceName = pathToken[0].toUpperCase() + pathToken.substring(1);
    }
    assert(!pathToken || pathToken[0] !== '/', '`path` should not begin with a /');
    const templateResourcePartial = (pathToken)
      ? templateResource({
        resourceName, // @FIXME prepend to resourceName the parent resources names
        resourcePath: pathToken,
        parentResourceName: lastResourceName
      })
      : {};
    lastResourceName = resourceName;
    templateResourcePartials = {
      ...templateResourcePartials,
      ...templateResourcePartial
    };
  });
  return {
    resourceName: lastResourceName,
    templateResourcePartial: templateResourcePartials
  };
}

export function templateResource ({
  resourceName,
  resourcePath,
  parentResourceName = null
}) {
  const parentId = !parentResourceName
    ? { 'Fn::GetAtt': [`${templateAPIID()}`, 'RootResourceId'] }
    : { 'Ref': `${templateResourceName({ resourceName: parentResourceName })}` };
  return {
    [`${templateResourceName({ resourceName })}`]: {
      'Type': 'AWS::ApiGateway::Resource',
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID()}` },
        'ParentId': parentId,
        'PathPart': resourcePath
      }
    }
  };
}

export function templateModel ({
  modelName,
  modelSchema
}) {
  return {
    [`${templateModelName({ modelName })}`]: {
      'Type': 'AWS::ApiGateway::Model',
      'Properties': {
        'ContentType': 'application/json',
        'Description': `Model ${modelName}`,
        'RestApiId': { 'Ref': `${templateAPIID()}` },
        'Schema': modelSchema
      }
    }
  };
}

export function templateMockIntegration () {
  return {
    'IntegrationResponses': [{
      'ResponseTemplates': {
        'text/html': 'Hello World from ApiGateway'
      },
      'StatusCode': 200
    }],
    'RequestTemplates': {
      'application/json': `{ "statusCode": 200 }`
    },
    'Type': 'MOCK'
  };
}

export function templateInvokationRole () {
  return {
    'APIGExecutionRole': {
      'Type': 'AWS::IAM::Role',
      'Properties': {
        'AssumeRolePolicyDocument': {
          'Version': '2012-10-17',
          'Statement': [{
            'Effect': 'Allow',
            'Principal': {'Service': ['apigateway.amazonaws.com']},
            'Action': ['sts:AssumeRole']
          }]
        },
        'Path': '/',
        'Policies': [{
          'PolicyName': 'invokeLambda',
          'PolicyDocument': {
            'Version': '2012-10-17',
            'Statement': [{
              'Effect': 'Allow',
              'Action': ['lambda:InvokeFunction'],
              'Resource': 'arn:aws:lambda:*:*:*'
            }]
          }
        }]
      }
    }
  };
}

export function templateLambdaIntegration ({
  lambdaName,
  responseContentType
}) {
  let responseTemplate;
  if (responseContentType.includes('application/json')) {
    responseTemplate = {
      'application/json': stripIndent`
        #set($inputRoot = $input.path('$'))
        $inputRoot.response
      `
    };
  } else if (responseContentType.includes('text/plain')) {
    responseTemplate = {
      'text/plain': stripIndent`
        #set($inputRoot = $input.path('$'))
        $inputRoot.response
      `
    };
  } else if (responseContentType.includes('text/html')) {
    responseTemplate = {
      'text/html': stripIndent`
        #set($inputRoot = $input.path('$'))
        $inputRoot.html
      `
    };
  } else {
    throw new Error('Configuration Error in Lambda Integration Response: no (valid) responseContentType has been defined. Supported values are application/json, text/html and text/plain.');
  }
  return {
    'IntegrationHttpMethod': 'POST',
    'IntegrationResponses': [{
      // "ResponseParameters": {},
      'ResponseTemplates': {
        ...responseTemplate
      },
      // "SelectionPattern": "regexp"
      'StatusCode': 200
    }],
    // "RequestParameters" : { String:String, ... },
    'PassthroughBehavior': 'NEVER',
    'RequestTemplates': {
      // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#util-template-reference
      // § "Param Mapping Template Example" and above
      'application/json': stripIndent`
        #set($allParams = $input.params())
        {
          "params" : {
            #foreach($type in $allParams.keySet())
            #set($params = $allParams.get($type))
            "$type" : {
              #foreach($paramName in $params.keySet())
              "$paramName" : "$util.escapeJavaScript($params.get($paramName))"
              #if($foreach.hasNext),#end
              #end
            }
            #if($foreach.hasNext),#end
            #end
          },
          "context" : {
            "apiId": "$context.apiId",
            "authorizer": {
              "principalId": "$context.authorizer.principalId",
              "claims": {
                #foreach($property in $context.authorizer.claims.keySet())
                "$property": "$context.authorizer.claims.get($property)"
                #if($foreach.hasNext),#end
                #end
              }
            },
            "httpMethod": "$context.httpMethod",
            "identity": {
              #foreach($property in $context.identity.keySet())
              "$property": "$context.identity.get($property)"
              #if($foreach.hasNext),#end
              #end
            },
            "requestId": "$context.requestId",
            "resourceId": "$context.resourceId",
            "resourcePath": "$context.resourcePath",
            "stage": "$context.stage"
          },
          "body": $input.json('$'),
          "meta": {
            "expectedResponseContentType": "${responseContentType}"
          },
          "stageVariables" : {
            #foreach($name in $stageVariables.keySet())
            "$name" : "$util.base64Decode($stageVariables.get($name))"
            #if($foreach.hasNext),#end
            #end
          }
        }
      `
    },
    'Type': 'AWS',
    'Credentials': { 'Fn::GetAtt': ['APIGExecutionRole', 'Arn'] },
    'Uri': { 'Fn::Join': ['', [
      `arn:aws:apigateway:`,
      { 'Ref': 'AWS::Region' },
      `:lambda:path/2015-03-31/functions/`,
      { 'Fn::GetAtt': [`${templateLambdaName({ lambdaName })}`, 'Arn'] },
      '/invocations'
    ]]
    }
  };
}

export function templateMethod ({
  resourceName,
  httpMethod = 'GET',
  lambdaName = null,
  responseContentType
}) {
  const responseModelName = 'HelloWorldModel';
  const resourceId = !resourceName
    ? { 'Fn::GetAtt': [`${templateAPIID()}`, 'RootResourceId'] }
    : { 'Ref': `${templateResourceName({ resourceName })}` };
  const integrationConfig = lambdaName
    ? templateLambdaIntegration({ lambdaName, responseContentType })
    : templateMockIntegration({});
  let responseModel;
  if (responseContentType.includes('application/json')) {
    responseModel = {
      'application/json': {
        'Ref': templateModelName({ modelName: responseModelName })
      }
    };
  } else if (responseContentType.includes('text/plain')) {
    responseModel = {
      'text/plain': {
        'Ref': templateModelName({ modelName: responseModelName })
      }
    };
  } else if (responseContentType.includes('text/html')) {
    responseModel = {
      'text/html': {
        'Ref': templateModelName({ modelName: responseModelName })
      }
    };
  } else {
    throw new Error('Configuration Error in Lambda Method: no (valid) responseContentType has been defined. Supported values are application/json, text/html and text/plain.');
  }
  return {
    ...templateInvokationRole({}),
    ...templateModel({ modelName: responseModelName, modelSchema: '{}' }),
    [`${templateMethodName({ resourceName, httpMethod })}`]: {
      'Type': 'AWS::ApiGateway::Method',
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID()}` },
        'ResourceId': resourceId,
        'HttpMethod': httpMethod,
        'AuthorizationType': 'NONE',
        'Integration': integrationConfig,
        'MethodResponses': [{
          'ResponseModels': {
            ...responseModel
          },
          'StatusCode': 200
        }]
      }
    }
  };
}

export function templateDeployment ({
  deploymentUid,
  dependsOnMethods,
  date = new Date().toISOString()
}) {
  const dependsOn = dependsOnMethods.map(methodInfo => {
    const { resourceName, httpMethod } = methodInfo;
    return templateMethodName({ resourceName, httpMethod });
  });
  return {
    [`${templateDeploymentName({ deploymentUid })}`]: {
      'DependsOn': dependsOn,
      'Type': 'AWS::ApiGateway::Deployment',
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID()}` },
        'Description': `Automated deployment by dawson on ${date}`
      }
    }
  };
}

export function templateStage ({
  stageName,
  deploymentUid,
  stageVariables = {}
}) {
  return {
    [`${templateStageName({ stageName })}`]: {
      'Type': 'AWS::ApiGateway::Stage',
      'Properties': {
        'CacheClusterEnabled': false,
        'DeploymentId': { 'Ref': `${templateDeploymentName({ deploymentUid })}` },
        'Description': `${stageName} Stage`,
        'RestApiId': { Ref: `${templateAPIID()}` },
        'StageName': `${stageName}`,
        'Variables': {
          ...stageVariables
        },
        'MethodSettings': [{
          'HttpMethod': '*',
          'ResourcePath': '/*',
          'LoggingLevel': 'INFO',
          'DataTraceEnabled': 'true'
        }]
      }
    }
  };
}

export function templateAccount () {
  return {
    'APIGatewayAccount': {
      'Type': 'AWS::ApiGateway::Account',
      'Properties': {
        'CloudWatchRoleArn': { 'Fn::GetAtt': [ templateCloudWatchRoleName(), 'Arn' ] }
      }
    }
  };
}

export function templateCloudWatchRole () {
  return {
    [templateCloudWatchRoleName()]: {
      'Type': 'AWS::IAM::Role',
      'Properties': {
        'AssumeRolePolicyDocument': {
          'Version': '2012-10-17',
          'Statement': [{
            'Effect': 'Allow',
            'Principal': { 'Service': ['apigateway.amazonaws.com'] },
            'Action': 'sts:AssumeRole'
          }]
        },
        'Path': '/',
        'ManagedPolicyArns': ['arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs']
      }
    }
  };
}
