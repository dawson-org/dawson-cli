
import test from 'tape';

import {
  templateAPIID,
  templateResourceName,
  templateMethodName,
  templateStageName,
  templateDeploymentName,
  templateModelName,
  templateRest,
  templateResourceHelper,
  templateResource,
  templateModel,
  templateLambdaIntegration,
  templateMethod,
  templateDeployment,
  templateStage
} from './cf_apig';

test('templateAPIID', t => {
  const expected = 'API';
  const actual = templateAPIID();
  t.deepEqual(actual, expected, 'should return app name suffixed by API');
  t.end();
});

test('templateResourceName', t => {
  const expected = 'ResourceUsers';
  const actual = templateResourceName({ resourceName: 'Users' });
  t.equal(actual, expected, 'should return resource name suffixed by Resource');
  t.end();
});

test('templateMethodName', t => {
  t.equal(
    templateMethodName({ resourceName: 'Users', httpMethod: 'GET' }),
    'MethodUsersGET',
    'should return resourceName, httpMethod concatenated and suffixed with Method');
  t.equal(
    templateMethodName({ httpMethod: 'GET' }),
    'MethodRootGET',
    'should assume resourceName = Root when called with no resourceName');
  t.end();
});

test('templateStageName', t => {
  const expected = 'Stageprod';
  const actual = templateStageName({ stageName: 'prod' });
  t.equal(actual, expected, 'should return stage name suffixed by Stage');
  t.end();
});

test('templateDeploymentName', t => {
  const expected = 'Deployment123456';
  const actual = templateDeploymentName({ deploymentUid: '123456' });
  t.equal(actual, expected, 'should return deployment id prefixed by Deployment');
  t.end();
});

test('templateModelName', t => {
  const expected = 'ModelEmpty';
  const actual = templateModelName({ modelName: 'Empty' });
  t.equal(actual, expected, 'should return model name suffixed by Model');
  t.end();
});

test('templateRest', t => {
  const expected = {
    API: {
      'Type': 'AWS::ApiGateway::RestApi',
      'Properties': {
        'Description': 'REST API for dawson app',
        'Name': 'AppAPI'
      }
    }
  };
  const actual = templateRest();
  t.deepEqual(actual, expected, 'should return a rest api template');
  t.end();
});

test('templateResourceHelper', t => {
  const expected = {
    resourceName: 'Prefix',
    templateResourcePartial: {
      ...templateResource({
        resourceName: 'List',
        resourcePath: 'list',
        parentResourceName: 'Users'
      }),
      ...templateResource({
        resourceName: 'Users',
        resourcePath: 'users',
        parentResourceName: null
      }),
      ...templateResource({
        resourceName: 'Prefix',
        resourcePath: '{prefix}',
        parentResourceName: 'List'
      })
    }
  };
  const actual = templateResourceHelper({
    resourcePath: 'users/list/{prefix}'
  });
  t.deepEqual(actual, expected, 'should return the leaf resource template plus all the parent resources templates');
  t.end();
});

test('templateResource', t => {
  t.deepEqual(
    templateResource({
      resourceName: 'Users',
      resourcePath: 'users',
      parentResourceName: null
    }), {
      ResourceUsers: {
        'Type': 'AWS::ApiGateway::Resource',
        'Properties': {
          'RestApiId': { 'Ref': 'API' },
          'ParentId': { 'Fn::GetAtt': ['API', 'RootResourceId'] },
          'PathPart': 'users'
        }
      }
    },
    'should return a resource template, which references the root api as parent');
  t.deepEqual(
    templateResource({
      resourceName: 'List',
      resourcePath: 'list',
      parentResourceName: 'Users'
    }), {
      ResourceList: {
        'Type': 'AWS::ApiGateway::Resource',
        'Properties': {
          'RestApiId': { 'Ref': 'API' },
          'ParentId': { 'Ref': 'ResourceUsers' },
          'PathPart': 'list'
        }
      }
    },
    'should return a resource template, which references the given parentResourceName as parent');
  t.end();
});

test('templateModel', t => {
  const expected = {
    'ModelCustomResponse': {
      'Type': 'AWS::ApiGateway::Model',
      'Properties': {
        'ContentType': 'application/json',
        'Description': `Model CustomResponse`,
        'RestApiId': { 'Ref': 'API' },
        'Schema': {}
      }
    }
  };
  const actual = templateModel({
    modelName: 'CustomResponse',
    modelSchema: {}
  });
  t.deepEqual(actual, expected, 'should return');
  t.end();
});

test.skip('templateLambdaIntegration', t => {
  const expected = '';
  const actual = templateLambdaIntegration();
  t.deepEqual(actual, expected, 'should return');
  t.end();
});

test.skip('templateMethod', t => {
  const expected = '';
  const actual = templateMethod();
  t.deepEqual(actual, expected, 'should return');
  t.end();
});

test('templateDeployment', t => {
  const date = new Date().toISOString();
  const expected = {
    'Deployment1234ABC': {
      'DependsOn': ['MethodUsersGET'],
      'Type': 'AWS::ApiGateway::Deployment',
      'Properties': {
        'RestApiId': { 'Ref': 'API' },
        'Description': `Automated deployment by danilo on ${date}`,
        'StageName': 'dummy'
      }
    }
  };
  const actual = templateDeployment({
    deploymentUid: '1234ABC',
    dependsOnMethods: [{ resourceName: 'Users', httpMethod: 'GET' }],
    date
  });
  t.deepEqual(actual, expected, 'should return the deployment template');
  t.end();
});

test('templateStage', t => {
  const expected = {
    'Stageprod': {
      'Type': 'AWS::ApiGateway::Stage',
      'Properties': {
        'CacheClusterEnabled': false,
        'DeploymentId': { Ref: 'Deployment1234567' },
        'Description': 'prod Stage',
        'RestApiId': { Ref: 'API' },
        'StageName': 'prod',
        'Variables': {
          abc: '123'
        }
      }
    }
  };
  const actual = templateStage({
    stageName: 'prod',
    deploymentUid: '1234567',
    stageVariables: { abc: '123' }
  });
  t.deepEqual(actual, expected, 'should return the stage template');
  t.end();
});
