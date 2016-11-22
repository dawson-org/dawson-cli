
import AWS from 'aws-sdk';
import { renderFile } from 'pug';

// 1. Basic functions
//

export function index (params) {
  console.log('index', params);
  return 'I am the root';
}
index.api = {
  path: ''
};

export function testRedirect (params) {
  console.log('You won\'t see me, I\'m redirecting to news.google.com');
  return {
    Location: 'https://news.google.com'
  };
}
testRedirect.api = {
  path: 'redir',
  redirects: true
};

export function helloWorld (params) {
  console.log('foobar', params);
  console.log('functions can return either promises or plain strings!');
  const html = renderFile('./templates/hello.pug', {
    params
  });
  return html;
}
helloWorld.api = {
  path: 'hello'
};

// 2. Basic function with a path parameter
//

export function helloWho (params) {
  console.log('Hello to whom?', params);
  const html = renderFile('./templates/hello.pug', {
    params
  });
  return Promise.resolve(html);
}
helloWho.api = {
  path: 'hello/{who}'
};

// 3. Basic function with custom resources and
//    a custom policy

// If you need to create extra resources, as part of this stack
// you can optionally define a processCFTemplate function which
// will receive the stack template before it's actually updated
// and should return the modified template.
// Please, make sure you include at least "Resources" and "Outputs"
export function processCFTemplate (template) {
  return {
    Resources: {
      ...template.Resources,
      MyTable: {
        'Type': 'AWS::DynamoDB::Table',
        'Properties': {
          'AttributeDefinitions': [{
            'AttributeName': 'Id',
            'AttributeType': 'S'
          }],
          'KeySchema': [{
            'AttributeName': 'Id',
            'KeyType': 'HASH'
          }],
          'ProvisionedThroughput': {
            'ReadCapacityUnits': '1',
            'WriteCapacityUnits': '1'
          }
        }
      }
    },
    Outputs: {
      ...template.Outputs,
      MyTableName: {
        Value: { 'Ref': 'MyTable' }
      }
    }
  };
}

export async function listMyTables (params) {
  console.log('I will list your DynamoDB tables');
  const dynamodb = new AWS.DynamoDB({});
  const tables = await dynamodb.listTables({}).promise();
  const myTable = params.stageVariables.MyTableName;
  console.log('I may now scan this table:', myTable);
  return 'Your tables: <pre>' + JSON.stringify(tables, null, 2) + '</pre>';
}
listMyTables.api = {
  path: 'dynamodb/listTables',
  // You can optionally provide a list of policy statements
  // that are added to this lambda's role
  // A statement that allows arn:aws:logs:* is inserted by default
  policyStatements: [{
    // allow listTables
    'Effect': 'Allow',
    'Resource': '*',
    'Action': ['dynamodb:ListTables']
  }, {
    // allow scan on MyTable
    'Effect': 'Allow',
    'Resource': { 'Fn::Join': ['', [
      'arn:aws:dynamodb:',
      { 'Ref': 'AWS::Region' },
      ':',
      { 'Ref': 'AWS::AccountId' },
      ':table/',
      { 'Ref': 'MyTable' }
    ]] },
    'Action': ['dynamodb:Scan']
  }]
};

// 4. Using an API Gateway Custom Authorizer

// Input and output parameters matches the ones in API Gateway docs:
// https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html#api-gateway-custom-authorizer-input
//

export async function defaultAuthorizer (event, context) {
  const UsersTable = context.templateOutputs.MyTableName;

  if (event.type !== 'TOKEN') {
    context.fail('Request is not of type TOKEN. Aborting');
    return;
  }

  const token = event.authorizationToken;
  const doc = new AWS.DynamoDB.DocumentClient({});
  const { Item: item } = await doc.get({
    TableName: UsersTable,
    Key: {
      Id: token
    }
  }).promise();

  if (!item) {
    context.fail('Token is invalid');
    return;
  }

  const principalId = `user-${token}`;
  const policyDocument = {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Action: 'execute-api:Invoke',
      Resource: event.methodArn
    }]
  };
  console.log('Authorization succeeded');
  context.succeed({ policyDocument, principalId });
}
defaultAuthorizer.api = {
  path: false,
  isEventHandler: true,
  policyStatements: [{
    Effect: 'Allow',
    Action: 'dynamodb:GetItem',
    Resource: { 'Fn::Sub': 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${MyTable}' } // eslint-disable-line
  }]
};

export function privateContent (params) {
  console.log('loading private content', params);
  return '42';
}
privateContent.api = {
  path: 'private',
  authorizer: defaultAuthorizer
};
