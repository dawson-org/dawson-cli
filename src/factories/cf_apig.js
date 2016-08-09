
import assert from 'assert';
import { stripIndent } from 'common-tags';

import {
  templateLambdaName
} from './cf_lambda';

export function templateAPIID ({ appName }) {
  return `${appName}API`;
}

export function templateResourceName ({ resourceName }) {
  return `${resourceName}Resource`;
}

export function templateMethodName ({ resourceName = 'Root', httpMethod }) {
  return `${resourceName}${httpMethod}Method`;
}

export function templateStageName ({ stageName }) {
  return `${stageName}Stage`;
}

export function templateDeploymentName ({ deploymentUid }) {
  return `Deployment${deploymentUid}`;
}

export function templateModelName ({ modelName }) {
  return `${modelName}Model`;
}


export function templateRest ({
  appName
}) {
  return {
    [`${templateAPIID({ appName })}`]: {
      'Type': 'AWS::ApiGateway::RestApi',
      'Properties': {
        'Description': `REST API for app ${appName}`,
        'Name': `${appName}`
      }
    }
  };
}


export function templateResourceHelper ({
  appName,
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
        appName,
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
  appName,
  resourceName,
  resourcePath,
  parentResourceName = null
}) {
  const parentId = !parentResourceName
    ? { 'Fn::GetAtt': [`${templateAPIID({ appName })}`, 'RootResourceId'] }
    : { 'Ref': `${templateResourceName({ resourceName: parentResourceName })}` };
  return {
    [`${templateResourceName({ resourceName })}`]: {
      'Type': 'AWS::ApiGateway::Resource',
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID({ appName })}` },
        'ParentId': parentId,
        'PathPart': resourcePath
      }
    }
  };
}

export function templateModel ({
  appName,
  modelName,
  modelSchema
}) {
  return {
    [`${templateModelName({ modelName })}`]: {
      'Type': 'AWS::ApiGateway::Model',
      'Properties': {
        'ContentType': 'application/json',
        'Description': `Model ${modelName}`,
        'Name': `${modelName}`,
        'RestApiId': { 'Ref': `${templateAPIID({ appName })}` },
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
        {
          "response": $inputRoot.response
        }
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
    throw new Error('Configuration Error in Lambda Integration Response: no (valid) responseContentType has been defined. Supported values are application/json and text/html, with optional encoding.');
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
  appName,
  resourceName,
  httpMethod = 'GET',
  lambdaName = null,
  responseContentType
}) {
  const responseModelName = 'HelloWorldModel';
  const resourceId = !resourceName
    ? { 'Fn::GetAtt': [`${templateAPIID({ appName })}`, 'RootResourceId'] }
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
  } else if (responseContentType.includes('text/html')) {
    responseModel = {
      'text/html': {
        'Ref': templateModelName({ modelName: responseModelName })
      }
    };
  } else {
    throw new Error('Configuration Error in Lambda Method: no (valid) responseContentType has been defined. Supported values are application/json and text/html, with optional encoding.');
  }
  return {
    ...templateInvokationRole({}),
    ...templateModel({ appName, modelName: responseModelName, modelSchema: '{}' }),
    [`${templateMethodName({ resourceName, httpMethod })}`]: {
      'Type': 'AWS::ApiGateway::Method',
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID({ appName })}` },
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
  appName,
  deploymentUid,
  dependsOnMethod: { resourceName, httpMethod },
  date = new Date().toISOString()
}) {
  return {
    [`${templateDeploymentName({ deploymentUid })}`]: {
      'DependsOn': `${templateMethodName({ resourceName, httpMethod })}`,
      'Type': 'AWS::ApiGateway::Deployment',
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID({ appName })}` },
        'Description': `Automated deployment by danilo on ${date}`,
        'StageName': 'dummy' // From the docs: "This property is required by API Gateway.
                              // We recommend that you specify a name using any value
                              // and that you don't use this stage"
      }
    }
  };
}

export function templateStage ({
  appName,
  stageName,
  deploymentUid,
  stageVariables = {}
}) {
  return {
    [`${templateStageName({ stageName })}`]: {
      'Type': 'AWS::ApiGateway::Stage',
      'Properties': {
        'CacheClusterEnabled': false,
        'DeploymentId': { 'Fn::GetAtt': ['InnerStack', 'Outputs.DeploymentId'] },
        'Description': `${stageName} Stage`,
        'RestApiId': { 'Fn::GetAtt': ['InnerStack', 'Outputs.RestApiId'] },
        'StageName': `${stageName}`,
        'Variables': {
          ...stageVariables
        }
      }
    }
  };
}
