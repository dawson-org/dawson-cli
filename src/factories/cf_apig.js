import assert from 'assert';
import { stripIndent } from 'common-tags';

import { templateLambdaName } from './cf_lambda';

const getMappingTemplate = ({ apigResponseContentType }) => stripIndent`
#set($allParams = $input.params())
{
  "params" : {
    #foreach($type in $allParams.keySet())
    #set($params = $allParams.get($type))
    "$type" : {
      #foreach($paramName in $params.keySet())
      #if($type == "header")
      "$paramName.toLowerCase()" : "$util.escapeJavaScript($params.get($paramName))"
      #else
      "$paramName" : "$util.escapeJavaScript($params.get($paramName))"
      #end
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
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        Description: `REST API for dawson app`,
        Name: `AppAPI${appStage[0].toUpperCase()}${appStage.slice(1)}`
      }
    }
  };
}

const resolvedPathResources = {};

export function templateResourceHelper ({ resourcePath }) {
  const resourcePathTokens = resourcePath.split('/');
  let lastResourceName;
  let templateResourcePartials = {};

  resourcePathTokens.forEach(pathToken => {
    let resourceName;
    if (!pathToken) {
      resourceName = null;
    } else if (pathToken[0] === '{') {
      let pathWithoutBrackets = /\{(.*)\}/.exec(pathToken)[1].replace(/\+/, 'Greedy');
      if (!pathWithoutBrackets.match(/^[a-z0-9+]+$/i)) {
        throw new Error(
          `Path part in '${resourcePath}' cannot contain non-alphanum characters inside brackets.`
        );
      }
      resourceName = pathWithoutBrackets[0].toUpperCase() +
        pathWithoutBrackets.substring(1);
    } else {
      const cleanPath = pathToken.replace(/[^a-z0-9]+/gi, '');
      resourceName = cleanPath[0].toUpperCase() + cleanPath.substring(1);
      if (!resolvedPathResources[cleanPath]) {
        resolvedPathResources[cleanPath] = pathToken;
      }
      if (resolvedPathResources[cleanPath] !== pathToken) {
        throw new Error(
          `Path part '${cleanPath}' in '${resourcePath}' conflicts with an existing path: '${resolvedPathResources[cleanPath]}', please rename.`
        );
      }
    }
    assert(
      !pathToken || pathToken[0] !== '/',
      '`path` should not begin with a /'
    );
    const templateResourcePartial = pathToken
      ? templateResource({
        resourceName,
        // @FIXME prepend to resourceName the parent resources names
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

export function templateResource (
  { resourceName, resourcePath, parentResourceName = null }
) {
  const parentId = !parentResourceName
    ? { 'Fn::GetAtt': [`${templateAPIID()}`, 'RootResourceId'] }
    : { Ref: `${templateResourceName({ resourceName: parentResourceName })}` };
  return {
    [`${templateResourceName({ resourceName })}`]: {
      Type: 'AWS::ApiGateway::Resource',
      Properties: {
        RestApiId: { Ref: `${templateAPIID()}` },
        ParentId: parentId,
        PathPart: resourcePath
      }
    }
  };
}

export function templateModel ({ modelName, modelSchema }) {
  return {
    [`${templateModelName({ modelName })}`]: {
      Type: 'AWS::ApiGateway::Model',
      Properties: {
        ContentType: 'application/json',
        Description: `Model ${modelName}`,
        RestApiId: { Ref: `${templateAPIID()}` },
        Schema: modelSchema
      }
    }
  };
}

export function templateLambdaIntegration (
  { lambdaName, responseContentType, redirects, lambdaRuntime }
) {
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
  const getSelectionPattern = statusCode => {
    if (lambdaRuntime === 'python2.7') {
      return `.*\\"httpStatus\\": ${statusCode}.*`;
    }
    return `.*"httpStatus":${statusCode}.*`;
  };
  return {
    IntegrationHttpMethod: 'POST',
    IntegrationResponses: [
      {
        ResponseParameters: responseParameters,
        ResponseTemplates: { ...responseTemplate },
        StatusCode: defaultStatusCode
      },
      {
        ResponseParameters: responseParameters,
        ResponseTemplates: { ...errorResponseTemplate },
        SelectionPattern: getSelectionPattern(500),
        StatusCode: 500
      },
      {
        ResponseParameters: responseParameters,
        ResponseTemplates: { ...errorResponseTemplate },
        SelectionPattern: getSelectionPattern(400),
        StatusCode: 400
      },
      {
        ResponseParameters: responseParameters,
        ResponseTemplates: { ...errorResponseTemplate },
        SelectionPattern: getSelectionPattern(403),
        StatusCode: 403
      },
      {
        ResponseParameters: responseParameters,
        ResponseTemplates: { ...errorResponseTemplate },
        SelectionPattern: getSelectionPattern(404),
        StatusCode: 404
      }
    ],
    // "RequestParameters" : { String:String, ... },
    PassthroughBehavior: 'NEVER',
    RequestTemplates: {
      // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#util-template-reference
      // § "Param Mapping Template Example" and above
      'application/x-www-form-urlencoded': getMappingTemplate({
        apigResponseContentType
      }),
      'application/json': getMappingTemplate({ apigResponseContentType })
    },
    Type: 'AWS',
    Uri: {
      'Fn::Join': [
        '',
        [
          `arn:aws:apigateway:`,
          { Ref: 'AWS::Region' },
          `:lambda:path/2015-03-31/functions/`,
          { 'Fn::GetAtt': [`${templateLambdaName({ lambdaName })}`, 'Arn'] },
          '/invocations'
        ]
      ]
    }
  };
}
export function templateMethod (
  {
    resourceName,
    httpMethod = 'GET',
    lambdaName,
    responseContentType,
    authorizerFunctionName,
    redirects,
    lambdaRuntime
  }
) {
  const responseModelName = 'HelloWorldModel';
  const resourceId = !resourceName
    ? { 'Fn::GetAtt': [`${templateAPIID()}`, 'RootResourceId'] }
    : { Ref: `${templateResourceName({ resourceName })}` };
  const integrationConfig = templateLambdaIntegration({
    lambdaName,
    responseContentType,
    redirects,
    lambdaRuntime
  });
  let responseModel;
  if (responseContentType.includes('application/json')) {
    responseModel = {
      'application/json': {
        Ref: templateModelName({ modelName: responseModelName })
      }
    };
  } else {
    responseModel = {
      [responseContentType]: {
        Ref: templateModelName({ modelName: responseModelName })
      }
    };
  }
  let authorizerConfig = { AuthorizationType: 'NONE' };
  if (authorizerFunctionName) {
    authorizerConfig = {
      ...authorizerConfig,
      AuthorizationType: 'CUSTOM',
      AuthorizerId: {
        Ref: `${templateAuthorizerName({ authorizerFunctionName })}`
      }
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
      Type: 'AWS::ApiGateway::Method',
      ...dependsOn,
      Properties: {
        RestApiId: { Ref: `${templateAPIID()}` },
        ResourceId: resourceId,
        HttpMethod: httpMethod,
        Integration: integrationConfig,
        MethodResponses: [
          { ResponseModels: { ...responseModel }, StatusCode: 200 },
          { ResponseModels: { ...responseModel }, StatusCode: 400 },
          { ResponseModels: { ...responseModel }, StatusCode: 403 },
          { ResponseModels: { ...responseModel }, StatusCode: 404 },
          { ResponseModels: { ...responseModel }, StatusCode: 500 },
          {
            ResponseModels: { ...responseModel },
            StatusCode: 307,
            ResponseParameters: { 'method.response.header.Location': false }
          }
        ],
        ...authorizerConfig
      }
    }
  };
}
export function templateDeployment ({ deploymentUid, dependsOnMethods }) {
  const dependsOn = dependsOnMethods.map(methodInfo => {
    const { resourceName, httpMethod } = methodInfo;
    return templateMethodName({ resourceName, httpMethod });
  });
  return {
    [`${templateDeploymentName({ deploymentUid })}`]: {
      DependsOn: dependsOn,
      Type: 'AWS::ApiGateway::Deployment',
      Properties: {
        RestApiId: { Ref: `${templateAPIID()}` },
        Description: `Automated deployment by dawson`
      }
    }
  };
}
export function templateStage ({ stageName, deploymentUid }) {
  return {
    [`${templateStageName({ stageName })}`]: {
      Type: 'AWS::ApiGateway::Stage',
      Properties: {
        CacheClusterEnabled: false,
        DeploymentId: { Ref: `${templateDeploymentName({ deploymentUid })}` },
        Description: `${stageName} Stage`,
        RestApiId: { Ref: `${templateAPIID()}` },
        StageName: `${stageName}`,
        MethodSettings: [
          {
            HttpMethod: '*',
            ResourcePath: '/*',
            LoggingLevel: 'INFO',
            DataTraceEnabled: 'true'
          }
        ]
      }
    }
  };
}
export function templateAccount () {
  return {
    ...templateCloudWatchRole(),
    APIGatewayAccount: {
      Type: 'AWS::ApiGateway::Account',
      Properties: {
        // eslint-disable-line
        CloudWatchRoleArn: { 'Fn::Sub': '${RoleAPIGatewayAccount.Arn}' }
      }
    }
  };
}
export function templateCloudWatchRole () {
  return {
    RoleAPIGatewayAccount: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: ['apigateway.amazonaws.com'] },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Path: '/',
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        ]
      }
    }
  };
}
function templateAuthorizerName ({ authorizerFunctionName }) {
  // sorry for the following line, but it's needed to avoid prettier
  // to wrap the line in a point that makes eslint complain
  const firstChar = authorizerFunctionName[0].toUpperCase();
  return `APIGAuthorizer${firstChar}${authorizerFunctionName.slice(1)}`;
}
export function templateAuthorizer ({ authorizerFunctionName }) {
  const lambdaLogicalName = templateLambdaName({
    lambdaName: `${authorizerFunctionName[0].toUpperCase()}${authorizerFunctionName.slice(1)}`
  });
  const authorizerName = templateAuthorizerName({ authorizerFunctionName });
  return {
    [`${authorizerName}`]: {
      Type: 'AWS::ApiGateway::Authorizer',
      Properties: {
        AuthorizerResultTtlInSeconds: 0,
        // eslint-disable-line
        AuthorizerUri: {
          'Fn::Sub': 'arn:aws:apigateway:${AWS::Region}:lambda:path//2015-03-31/functions/${' +
            lambdaLogicalName +
            '.Arn}/invocations'
        },
        IdentitySource: 'method.request.header.token',
        Name: `${authorizerName}`,
        RestApiId: { Ref: templateAPIID() },
        Type: 'TOKEN'
      }
    }
  };
}
