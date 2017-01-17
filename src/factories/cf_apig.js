
import assert from 'assert';
import { stripIndent } from 'common-tags';

import {
  templateLambdaName
} from './cf_lambda';

const getMappingTemplate = ({ apigResponseContentType }) => stripIndent`
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
      #foreach($property in $context.authorizer.keySet())
      "$property": "$context.authorizer.get($property)"
      #if($foreach.hasNext),#end
      #end
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
    "expectedResponseContentType": "${apigResponseContentType}"
  }
}
`;

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

export function templateLambdaIntegration ({
  lambdaName,
  responseContentType,
  redirects
}) {
  let responseTemplate = {
    [responseContentType]: stripIndent`
      #set($inputRoot = $input.path('$'))
      $inputRoot.response
    `
  };
  let errorResponseTemplate = {
    [responseContentType]: stripIndent`
      #set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
      $errorMessageObj.response
    `
  };
  if (responseContentType.includes('application/json')) {
    errorResponseTemplate = {
      'application/json': stripIndent`
        $input.path('$.errorMessage')
      `
    };
  }
  let apigResponseContentType = responseContentType;
  let defaultStatusCode = 200;
  let responseParameters = {};
  if (redirects) {
    defaultStatusCode = 307;
    responseParameters = {
      ...responseParameters,
      'method.response.header.Location': 'integration.response.body.response.Location'
    };
    apigResponseContentType = 'text/plain';
    responseTemplate = {
      'text/plain': stripIndent`
        #set($inputRoot = $input.path('$'))
        You are being redirected to $inputRoot.response.Location
      `
    };
    errorResponseTemplate = {
      'text/plain': stripIndent`
        Cannot redirect because of an error
      `
    };
  }
  return {
    'IntegrationHttpMethod': 'POST',
    'IntegrationResponses': [{
      'ResponseParameters': responseParameters,
      'ResponseTemplates': { ...responseTemplate },
      'StatusCode': defaultStatusCode
    }, {
      'ResponseParameters': responseParameters,
      'ResponseTemplates': { ...errorResponseTemplate },
      'SelectionPattern': `.*"httpStatus":500.*`,
      'StatusCode': 500
    }, {
      'ResponseParameters': responseParameters,
      'ResponseTemplates': { ...errorResponseTemplate },
      'SelectionPattern': `.*"httpStatus":400.*`,
      'StatusCode': 400
    }, {
      'ResponseParameters': responseParameters,
      'ResponseTemplates': { ...errorResponseTemplate },
      'SelectionPattern': `.*"httpStatus":403.*`,
      'StatusCode': 403
    }, {
      'ResponseParameters': responseParameters,
      'ResponseTemplates': { ...errorResponseTemplate },
      'SelectionPattern': `.*"httpStatus":404.*`,
      'StatusCode': 404
    }],
    // "RequestParameters" : { String:String, ... },
    'PassthroughBehavior': 'NEVER',
    'RequestTemplates': {
      // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#util-template-reference
      // § "Param Mapping Template Example" and above
      'application/x-www-form-urlencoded': getMappingTemplate({ apigResponseContentType }),
      'application/json': getMappingTemplate({ apigResponseContentType })
    },
    'Type': 'AWS',
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
  responseContentType,
  authorizerFunctionName,
  redirects
}) {
  const responseModelName = 'HelloWorldModel';
  const resourceId = !resourceName
    ? { 'Fn::GetAtt': [`${templateAPIID()}`, 'RootResourceId'] }
    : { 'Ref': `${templateResourceName({ resourceName })}` };
  const integrationConfig = lambdaName
    ? templateLambdaIntegration({ lambdaName, responseContentType, redirects })
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
    responseModel = {
      [responseContentType]: {
        'Ref': templateModelName({ modelName: responseModelName })
      }
    };
  }
  let authorizerConfig = {
    'AuthorizationType': 'NONE'
  };
  if (authorizerFunctionName) {
    authorizerConfig = {
      ...authorizerConfig,
      AuthorizationType: 'CUSTOM',
      AuthorizerId: { Ref: `${templateAuthorizerName({ authorizerFunctionName })}` }
    };
  }
  let authorizerPartial;
  if (authorizerFunctionName) {
    authorizerPartial = templateAuthorizer({ authorizerFunctionName });
  }
  let dependsOn;
  if (authorizerFunctionName) {
    dependsOn = {
      DependsOn: [`${templateAuthorizerName({ authorizerFunctionName })}`]
    };
  }

  return {
    ...templateModel({ modelName: responseModelName, modelSchema: '{}' }),
    ...authorizerPartial,
    [`${templateMethodName({ resourceName, httpMethod })}`]: {
      'Type': 'AWS::ApiGateway::Method',
      ...dependsOn,
      'Properties': {
        'RestApiId': { 'Ref': `${templateAPIID()}` },
        'ResourceId': resourceId,
        'HttpMethod': httpMethod,
        'Integration': integrationConfig,
        'MethodResponses': [{
          'ResponseModels': { ...responseModel },
          'StatusCode': 200
        }, {
          'ResponseModels': { ...responseModel },
          'StatusCode': 400
        }, {
          'ResponseModels': { ...responseModel },
          'StatusCode': 403
        }, {
          'ResponseModels': { ...responseModel },
          'StatusCode': 404
        }, {
          'ResponseModels': { ...responseModel },
          'StatusCode': 500
        }, {
          'ResponseModels': { ...responseModel },
          'StatusCode': 307,
          'ResponseParameters': {
            'method.response.header.Location': false
          }
        }],
        ...authorizerConfig
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
  deploymentUid
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
    ...templateCloudWatchRole(),
    'APIGatewayAccount': {
      'Type': 'AWS::ApiGateway::Account',
      'Properties': {
        'CloudWatchRoleArn': { 'Fn::Sub': '${RoleAPIGatewayAccount.Arn}' } // eslint-disable-line
      }
    }
  };
}

function templateCloudWatchRole () {
  return {
    'RoleAPIGatewayAccount': {
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

function templateAuthorizerName ({
  authorizerFunctionName
}) {
  return `APIGAuthorizer${authorizerFunctionName[0].toUpperCase()}${authorizerFunctionName.slice(1)}`;
}

export function templateAuthorizer ({
  authorizerFunctionName
}) {
  const lambdaLogicalName = templateLambdaName({ lambdaName: `${authorizerFunctionName[0].toUpperCase()}${authorizerFunctionName.slice(1)}` });
  const authorizerName = templateAuthorizerName({ authorizerFunctionName });
  return {
    [`${authorizerName}`]: {
      'Type': 'AWS::ApiGateway::Authorizer',
      'Properties': {
        'AuthorizerResultTtlInSeconds': 0,
        'AuthorizerUri': { 'Fn::Sub': 'arn:aws:apigateway:${AWS::Region}:lambda:path//2015-03-31/functions/${' + lambdaLogicalName + '.Arn}/invocations' }, // eslint-disable-line
        'IdentitySource': 'method.request.header.token',
        'Name': `${authorizerName}`,
        'RestApiId': { Ref: templateAPIID() },
        'Type': 'TOKEN'
      }
    }
  };
}
