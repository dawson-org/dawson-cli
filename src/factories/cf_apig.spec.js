/* eslint unused: 0 */

import test from 'ava';
import sortObject from 'deep-sort-object';

import {
  templateAccount,
  templateDeployment,
  templateLambdaIntegration,
  templateMethod,
  templateModel,
  templateResource,
  templateResourceHelper,
  templateRest,
  templateStage,
  templateCloudWatchRole,
  templateAuthorizer
} from './cf_apig';

const requestTemplatePartial = contentType => {
  return `#set($allParams = $input.params())
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
    "expectedResponseContentType": "${contentType}"
  }
}`;
};

test('templateRest', t => {
  const expected = {
    API: {
      Type: 'AWS::ApiGateway::RestApi',
      Properties: { Description: 'REST API for dawson app', Name: 'AppAPIStage' }
    }
  };
  const actual = templateRest({ appStage: 'stage' });
  t.deepEqual(
    sortObject(expected),
    sortObject(actual),
    'should return a rest api template'
  );
});

test('templateResource', t => {
  t.deepEqual(
    templateResource({ resourceName: 'Users', resourcePath: 'users' }),
    {
      ResourceUsers: {
        Type: 'AWS::ApiGateway::Resource',
        Properties: {
          RestApiId: { Ref: 'API' },
          ParentId: { 'Fn::GetAtt': ['API', 'RootResourceId'] },
          PathPart: 'users'
        }
      }
    },
    'should return a resource template, which references the root api as parent'
  );
  t.deepEqual(
    templateResource({
      resourceName: 'List',
      resourcePath: 'list',
      parentResourceName: 'Users'
    }),
    {
      ResourceList: {
        Type: 'AWS::ApiGateway::Resource',
        Properties: {
          RestApiId: { Ref: 'API' },
          ParentId: { Ref: 'ResourceUsers' },
          PathPart: 'list'
        }
      }
    },
    'should return a resource template, which references the given parentResourceName as parent'
  );
});

test('templateResourceHelper', t => {
  const expected = {
    resourceName: 'Bar',
    templateResourcePartial: {
      ResourceBar: {
        Properties: {
          ParentId: { Ref: 'ResourceFoo' },
          PathPart: 'bar',
          RestApiId: { Ref: 'API' }
        },
        Type: 'AWS::ApiGateway::Resource'
      },
      ResourceFoo: {
        Properties: {
          ParentId: { 'Fn::GetAtt': ['API', 'RootResourceId'] },
          PathPart: 'foo',
          RestApiId: { Ref: 'API' }
        },
        Type: 'AWS::ApiGateway::Resource'
      }
    }
  };
  const actual = templateResourceHelper({ resourcePath: 'foo/bar' });
  t.deepEqual(sortObject(expected), sortObject(actual));
});

test('templateResourceHelper with named params', t => {
  const expected = {
    resourceName: 'Bar',
    templateResourcePartial: {
      ResourceBar: {
        Properties: {
          ParentId: { Ref: 'ResourceFoo' },
          PathPart: '{bar}',
          RestApiId: { Ref: 'API' }
        },
        Type: 'AWS::ApiGateway::Resource'
      },
      ResourceFoo: {
        Properties: {
          ParentId: { 'Fn::GetAtt': ['API', 'RootResourceId'] },
          PathPart: 'foo',
          RestApiId: { Ref: 'API' }
        },
        Type: 'AWS::ApiGateway::Resource'
      }
    }
  };
  const actual = templateResourceHelper({ resourcePath: 'foo/{bar}' });
  t.deepEqual(sortObject(expected), sortObject(actual));
});

test('templateResourceHelper with empty path', t => {
  const expected = {
    resourceName: null, // this will cause Resourcenull to be created
    templateResourcePartial: {}
  };
  const actual = templateResourceHelper({ resourcePath: '' });
  t.deepEqual(sortObject(expected), sortObject(actual));
});

test('templateModel', t => {
  const expected = {
    ModelCustomResponse: {
      Type: 'AWS::ApiGateway::Model',
      Properties: {
        ContentType: 'application/json',
        Description: `Model CustomResponse`,
        RestApiId: { Ref: 'API' },
        Schema: {}
      }
    }
  };
  const actual = templateModel({ modelName: 'CustomResponse', modelSchema: {} });
  t.deepEqual(sortObject(expected), sortObject(actual), 'should return');
});

test('templateLambdaIntegration with custom ContentType', t => {
  const expected = {
    IntegrationHttpMethod: 'POST',
    IntegrationResponses: [
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'text/x-beer': (
            `#set($inputRoot = $input.path('$'))
$inputRoot.response`
          )
        },
        StatusCode: 200
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'text/x-beer': (
            `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
          )
        },
        SelectionPattern: '.*"httpStatus":500.*',
        StatusCode: 500
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'text/x-beer': (
            `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
          )
        },
        SelectionPattern: '.*"httpStatus":400.*',
        StatusCode: 400
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'text/x-beer': (
            `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
          )
        },
        SelectionPattern: '.*"httpStatus":403.*',
        StatusCode: 403
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'text/x-beer': (
            `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
          )
        },
        SelectionPattern: '.*"httpStatus":404.*',
        StatusCode: 404
      }
    ],
    PassthroughBehavior: 'NEVER',
    RequestTemplates: {
      'application/json': requestTemplatePartial('text/x-beer'),
      'application/x-www-form-urlencoded': requestTemplatePartial('text/x-beer')
    },
    Type: 'AWS',
    Uri: {
      'Fn::Join': [
        '',
        [
          'arn:aws:apigateway:',
          { Ref: 'AWS::Region' },
          ':lambda:path/2015-03-31/functions/',
          { 'Fn::GetAtt': ['Lambdabarman', 'Arn'] },
          '/invocations'
        ]
      ]
    }
  };
  const actual = templateLambdaIntegration({
    lambdaName: 'barman',
    responseContentType: 'text/x-beer',
    redirects: false
  });
  t.deepEqual(sortObject(expected), sortObject(actual), 'should return');
});

test('templateLambdaIntegration with ContentType = application/json', t => {
  const expected = {
    IntegrationHttpMethod: 'POST',
    IntegrationResponses: [
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'application/json': (
            `#set($inputRoot = $input.path('$'))
$inputRoot.response`
          )
        },
        StatusCode: 200
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'application/json': `$input.path('$.errorMessage')`
        },
        SelectionPattern: '.*"httpStatus":500.*',
        StatusCode: 500
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'application/json': `$input.path('$.errorMessage')`
        },
        SelectionPattern: '.*"httpStatus":400.*',
        StatusCode: 400
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'application/json': `$input.path('$.errorMessage')`
        },
        SelectionPattern: '.*"httpStatus":403.*',
        StatusCode: 403
      },
      {
        ResponseParameters: {},
        ResponseTemplates: {
          'application/json': `$input.path('$.errorMessage')`
        },
        SelectionPattern: '.*"httpStatus":404.*',
        StatusCode: 404
      }
    ],
    PassthroughBehavior: 'NEVER',
    RequestTemplates: {
      'application/json': requestTemplatePartial('application/json'),
      'application/x-www-form-urlencoded': requestTemplatePartial(
        'application/json'
      )
    },
    Type: 'AWS',
    Uri: {
      'Fn::Join': [
        '',
        [
          'arn:aws:apigateway:',
          { Ref: 'AWS::Region' },
          ':lambda:path/2015-03-31/functions/',
          { 'Fn::GetAtt': ['Lambdabarman', 'Arn'] },
          '/invocations'
        ]
      ]
    }
  };
  const actual = templateLambdaIntegration({
    lambdaName: 'barman',
    responseContentType: 'application/json',
    redirects: false
  });
  t.deepEqual(sortObject(expected), sortObject(actual), 'should return');
});

test('templateLambdaIntegration with redirect = true', t => {
  const expected = {
    IntegrationHttpMethod: 'POST',
    IntegrationResponses: [
      {
        ResponseParameters: {
          'method.response.header.Location': 'integration.response.body.response.Location'
        },
        ResponseTemplates: {
          'text/plain': (
            `#set($inputRoot = $input.path('$'))
You are being redirected to $inputRoot.response.Location`
          )
        },
        StatusCode: 307
      },
      {
        ResponseParameters: {
          'method.response.header.Location': 'integration.response.body.response.Location'
        },
        ResponseTemplates: {
          'text/plain': `Cannot redirect because of an error`
        },
        SelectionPattern: '.*"httpStatus":500.*',
        StatusCode: 500
      },
      {
        ResponseParameters: {
          'method.response.header.Location': 'integration.response.body.response.Location'
        },
        ResponseTemplates: {
          'text/plain': `Cannot redirect because of an error`
        },
        SelectionPattern: '.*"httpStatus":400.*',
        StatusCode: 400
      },
      {
        ResponseParameters: {
          'method.response.header.Location': 'integration.response.body.response.Location'
        },
        ResponseTemplates: {
          'text/plain': `Cannot redirect because of an error`
        },
        SelectionPattern: '.*"httpStatus":403.*',
        StatusCode: 403
      },
      {
        ResponseParameters: {
          'method.response.header.Location': 'integration.response.body.response.Location'
        },
        ResponseTemplates: {
          'text/plain': `Cannot redirect because of an error`
        },
        SelectionPattern: '.*"httpStatus":404.*',
        StatusCode: 404
      }
    ],
    PassthroughBehavior: 'NEVER',
    RequestTemplates: {
      'application/json': requestTemplatePartial('text/plain'),
      'application/x-www-form-urlencoded': requestTemplatePartial('text/plain')
    },
    Type: 'AWS',
    Uri: {
      'Fn::Join': [
        '',
        [
          'arn:aws:apigateway:',
          { Ref: 'AWS::Region' },
          ':lambda:path/2015-03-31/functions/',
          { 'Fn::GetAtt': ['Lambdabarman', 'Arn'] },
          '/invocations'
        ]
      ]
    }
  };
  const actual = templateLambdaIntegration({
    lambdaName: 'barman',
    responseContentType: 'application/json',
    redirects: true
  });
  t.deepEqual(sortObject(expected), sortObject(actual), 'should return');
});

test('templateMethod with an authorizer', t => {
  const expected = {
    APIGAuthorizerDemoBarAuthorizer: {
      Properties: {
        AuthorizerResultTtlInSeconds: 0,
        AuthorizerUri: {
          'Fn::Sub': 'arn:aws:apigateway:\x24{AWS::Region}:lambda:path//2015-03-31/functions/\x24{LambdaDemoBarAuthorizer.Arn}/invocations'
        },
        IdentitySource: 'method.request.header.token',
        Name: 'APIGAuthorizerDemoBarAuthorizer',
        RestApiId: { Ref: 'API' },
        Type: 'TOKEN'
      },
      Type: 'AWS::ApiGateway::Authorizer'
    },
    MethodRootGET: {
      DependsOn: ['APIGAuthorizerDemoBarAuthorizer'],
      Properties: {
        AuthorizationType: 'CUSTOM',
        AuthorizerId: { Ref: 'APIGAuthorizerDemoBarAuthorizer' },
        HttpMethod: 'GET',
        Integration: {
          IntegrationHttpMethod: 'POST',
          IntegrationResponses: [
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'text/x-bar': (
                  `#set($inputRoot = $input.path('$'))
$inputRoot.response`
                )
              },
              StatusCode: 200
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'text/x-bar': (
                  `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
                )
              },
              SelectionPattern: '.*"httpStatus":500.*',
              StatusCode: 500
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'text/x-bar': (
                  `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
                )
              },
              SelectionPattern: '.*"httpStatus":400.*',
              StatusCode: 400
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'text/x-bar': (
                  `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
                )
              },
              SelectionPattern: '.*"httpStatus":403.*',
              StatusCode: 403
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'text/x-bar': (
                  `#set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
$errorMessageObj.response`
                )
              },
              SelectionPattern: '.*"httpStatus":404.*',
              StatusCode: 404
            }
          ],
          PassthroughBehavior: 'NEVER',
          RequestTemplates: {
            'application/json': requestTemplatePartial('text/x-bar'),
            'application/x-www-form-urlencoded': requestTemplatePartial(
              'text/x-bar'
            )
          },
          Type: 'AWS',
          Uri: {
            'Fn::Join': [
              '',
              [
                'arn:aws:apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                { 'Fn::GetAtt': ['LambdafooBarGet', 'Arn'] },
                '/invocations'
              ]
            ]
          }
        },
        MethodResponses: [
          {
            ResponseModels: { 'text/x-bar': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 200
          },
          {
            ResponseModels: { 'text/x-bar': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 400
          },
          {
            ResponseModels: { 'text/x-bar': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 403
          },
          {
            ResponseModels: { 'text/x-bar': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 404
          },
          {
            ResponseModels: { 'text/x-bar': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 500
          },
          {
            ResponseModels: { 'text/x-bar': { Ref: 'ModelHelloWorldModel' } },
            ResponseParameters: { 'method.response.header.Location': false },
            StatusCode: 307
          }
        ],
        ResourceId: { 'Fn::GetAtt': ['API', 'RootResourceId'] },
        RestApiId: { Ref: 'API' }
      },
      Type: 'AWS::ApiGateway::Method'
    },
    ModelHelloWorldModel: {
      Properties: {
        ContentType: 'application/json',
        Description: 'Model HelloWorldModel',
        RestApiId: { Ref: 'API' },
        Schema: '{}'
      },
      Type: 'AWS::ApiGateway::Model'
    }
  };
  const actual = templateMethod({
    lambdaName: 'fooBarGet',
    responseContentType: 'text/x-bar',
    authorizerFunctionName: 'demoBarAuthorizer',
    redirects: false
  });
  t.deepEqual(sortObject(expected), sortObject(actual), 'should return');
});

test('templateMethod without an authorizer', t => {
  const expected = {
    MethodbarpathGET: {
      Properties: {
        AuthorizationType: 'NONE',
        HttpMethod: 'GET',
        Integration: {
          IntegrationHttpMethod: 'POST',
          IntegrationResponses: [
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'application/json': (
                  `#set($inputRoot = $input.path('$'))
$inputRoot.response`
                )
              },
              StatusCode: 200
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'application/json': `$input.path('$.errorMessage')`
              },
              SelectionPattern: '.*"httpStatus":500.*',
              StatusCode: 500
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'application/json': `$input.path('$.errorMessage')`
              },
              SelectionPattern: '.*"httpStatus":400.*',
              StatusCode: 400
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'application/json': `$input.path('$.errorMessage')`
              },
              SelectionPattern: '.*"httpStatus":403.*',
              StatusCode: 403
            },
            {
              ResponseParameters: {},
              ResponseTemplates: {
                'application/json': `$input.path('$.errorMessage')`
              },
              SelectionPattern: '.*"httpStatus":404.*',
              StatusCode: 404
            }
          ],
          PassthroughBehavior: 'NEVER',
          RequestTemplates: {
            'application/json': requestTemplatePartial('application/json'),
            'application/x-www-form-urlencoded': requestTemplatePartial(
              'application/json'
            )
          },
          Type: 'AWS',
          Uri: {
            'Fn::Join': [
              '',
              [
                'arn:aws:apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                { 'Fn::GetAtt': ['LambdafooBarGet', 'Arn'] },
                '/invocations'
              ]
            ]
          }
        },
        MethodResponses: [
          {
            ResponseModels: { 'application/json': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 200
          },
          {
            ResponseModels: { 'application/json': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 400
          },
          {
            ResponseModels: { 'application/json': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 403
          },
          {
            ResponseModels: { 'application/json': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 404
          },
          {
            ResponseModels: { 'application/json': { Ref: 'ModelHelloWorldModel' } },
            StatusCode: 500
          },
          {
            ResponseModels: { 'application/json': { Ref: 'ModelHelloWorldModel' } },
            ResponseParameters: { 'method.response.header.Location': false },
            StatusCode: 307
          }
        ],
        ResourceId: { Ref: 'Resourcebarpath' },
        RestApiId: { Ref: 'API' }
      },
      Type: 'AWS::ApiGateway::Method'
    },
    ModelHelloWorldModel: {
      Properties: {
        ContentType: 'application/json',
        Description: 'Model HelloWorldModel',
        RestApiId: { Ref: 'API' },
        Schema: '{}'
      },
      Type: 'AWS::ApiGateway::Model'
    }
  };
  const actual = templateMethod({
    lambdaName: 'fooBarGet',
    responseContentType: 'application/json',
    resourceName: 'barpath',
    redirects: false
  });
  t.deepEqual(sortObject(expected), sortObject(actual), 'should return');
});

test('templateDeployment', t => {
  const expected = {
    Deployment1234ABC: {
      DependsOn: ['MethodUsersGET'],
      Type: 'AWS::ApiGateway::Deployment',
      Properties: {
        RestApiId: { Ref: 'API' },
        Description: `Automated deployment by dawson`
      }
    }
  };
  const actual = templateDeployment({
    deploymentUid: '1234ABC',
    dependsOnMethods: [{ resourceName: 'Users', httpMethod: 'GET' }]
  });
  t.deepEqual(
    sortObject(expected),
    sortObject(actual),
    'should return the deployment template'
  );
});

test('templateStage', t => {
  const expected = {
    StageProd: {
      Type: 'AWS::ApiGateway::Stage',
      Properties: {
        CacheClusterEnabled: false,
        DeploymentId: { Ref: 'Deployment1234567' },
        Description: 'prod Stage',
        RestApiId: { Ref: 'API' },
        StageName: 'prod',
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
  const actual = templateStage({ stageName: 'prod', deploymentUid: '1234567' });
  t.deepEqual(
    sortObject(expected),
    sortObject(actual),
    'should return the stage template'
  );
});

test('templateAccount', t => {
  const expected = {
    APIGatewayAccount: {
      Type: 'AWS::ApiGateway::Account',
      Properties: {
        CloudWatchRoleArn: { 'Fn::Sub': '\x24{RoleAPIGatewayAccount.Arn}' }
      }
    },
    RoleAPIGatewayAccount: {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: ['apigateway.amazonaws.com'] }
            }
          ],
          Version: '2012-10-17'
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        ],
        Path: '/'
      },
      Type: 'AWS::IAM::Role'
    }
  };
  const actual = templateAccount();
  t.deepEqual(
    sortObject(expected),
    sortObject(actual),
    'should return the stage template'
  );
});

test('templateCloudWatchRole', t => {
  const expected = {
    RoleAPIGatewayAccount: {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: ['apigateway.amazonaws.com'] }
            }
          ],
          Version: '2012-10-17'
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        ],
        Path: '/'
      },
      Type: 'AWS::IAM::Role'
    }
  };
  const actual = templateCloudWatchRole();
  t.deepEqual(
    actual,
    expected,
    'should return an API Gateway role with push access to CloudWatch Logs'
  );
});

test('templateAuthorizer', t => {
  const expected = {
    APIGAuthorizerFooBar: {
      Properties: {
        AuthorizerResultTtlInSeconds: 0,
        AuthorizerUri: {
          'Fn::Sub': 'arn:aws:apigateway:\x24{AWS::Region}:lambda:path//2015-03-31/functions/\x24{LambdaFooBar.Arn}/invocations'
        },
        IdentitySource: 'method.request.header.token',
        Name: 'APIGAuthorizerFooBar',
        RestApiId: { Ref: 'API' },
        Type: 'TOKEN'
      },
      Type: 'AWS::ApiGateway::Authorizer'
    }
  };
  const actual = templateAuthorizer({ authorizerFunctionName: 'fooBar' });
  t.deepEqual(
    expected,
    actual,
    'should return an API Gateway Authorizer template'
  );
});
