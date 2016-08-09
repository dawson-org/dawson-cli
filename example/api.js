
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
