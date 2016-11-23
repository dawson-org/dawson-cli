
API Documentation
=================

* [`package.json` fields](./PACKAGEJSON-FIELDS.md)
* [`api.js` file contents](#apijs-file-contents)
  * [Customizing a dawson template](#customizing-a-dawson-template)
* [`lambda function signature`](./FUNCTION-SIGNATURE.md)
* [`lambda function configuration`](./FUNCTION-CONFIGURATION.md)



## `api.js` file contents

You must have an `api.js` file in the folder where you will run `dawson`. This file may use ES2017 and must, at least, export a function.

##### Basic function

```js
export function index (params) {
  console.log('Called with', params)
  return '<html><body><marquee>I love Marquees</marquee></body></html>'
}
index.api = {
  path: ''
}
```

##### Async function

```js
export function fetchAsync (params) {
  return new Promise((resolve, reject) => {
    // ...
    resolve('<html><body><center>Bar Baz</center></body></html>')
  })
}
fetchAsync.api = {
  path: '/fetchSomething'
}
```

##### Returning JSON

```js
export function fetchMe (params) {
  return {
    my: 'data'
  }
}
fetchMe.api = {
  path: '/fetchMyJSON',
  responseContentType: 'application/json'
}
```

##### Creating an Event Handler Function

```js
export async function handlerEvent (event) {
  console.log('Records received from DynamoDB/S3/Kinesis...', event.Records)
  return 'OK' // this is not needed
}
handlerEvent.api = {
  path: false,
  isEventHandler: true, // this option will remove all the wrapping and unwrapping specific to the API Gateway integration
}
```


##### Using async/await

```js
export async function listProjects(event) {
  // get a Physical name from CloudFormation's Outputs
  const tableName = event.stageVariables.MyProjects;

  // scan this table
  const response = await dynamodb.scan({
    TableName: tableName,
  }).promise();

  // set responseContentType below
  // and just return a plain object
  return {
    projects: response.Items,
  };
}
listProjects.api = {
  path: 'projects',
  responseContentType: 'application/json',
  policyStatements: [{
    Effect: "Allow",
    Action: ["dynamodb:Scan"],
    Resource: "*", // your ARN here (see the examples)
  }],
};
```

For `api` property reference, see [Function property reference](#function-property-reference).
For function params reference, see [Lambda parameters reference](#lambda parameters-reference).



#### Customizing a dawson template

If you need to add more Resources or modify Resources and Outputs created by `dawson` you may export a `processCFTemplate` function from your `api.js`.
This function takes 2 parameters: 
* a CloudFormation Template (object, like [this](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/quickref-lambda.html))
* `config` (object, see below)

This function must return the new (possibly updated) template. `processCFTemplate` will be invoked right before calling CloudFormation's `UpdateStack` API. The template passed to this function will **not** contain the Stage (currently, there's no way to customize a stage template).

Every resource has a fixed Logical Name, which you can get from the CloudFormation console and you can rely on it. The logical name will not change unless `dawson` major version is changed (v2 may change Logical Names, v1.200 will not). There's one gotcha: currently, since CloudFormation won't allow updating a Deployment, we create a new deployment for each `deploy` command; a deployment will have a random name you can get from the `config` parameter.

CloudFormation is very powerful, but sometimes it might be very complex. Keep in mind that CloudFormation [Template Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-reference.html) is your friend.

##### `processCFTemplate`'s `config` parameter
The `config` parameter will follow this spec:
```js
{
  deploymentLogicalName: "Deployment Logical Name"
}
```

A possible use case for `deploymentLogicalName` is to deploy a custom ApiGateway Method. When adding a method you must add its LogicalName to the DependsOn array of the Deploment, otherwise your deployment will *not* contain that method.


##### Example 1: Adding a DynamoDB Table

```js
const PROJECTS_TABLE = {
  Resources: {
    ProjectsTable: {
      "Type": "AWS::DynamoDB::Table",
      "Properties": {
        "AttributeDefinitions": [{
          "AttributeName": "ProjectId",
          "AttributeType": "S"
        }],
        "KeySchema": [{
          "AttributeName" : "ProjectId",
          "KeyType" : "HASH"
        }],
        "ProvisionedThroughput" : {
          "ReadCapacityUnits" : "1",
          "WriteCapacityUnits" : "1"
        }
      }
    }
  },
  Outputs: {
    ProjectsTable: {
      "Value": { "Ref": "ProjectsTable" }
    }
  }
};

export function processCFTemplate(template) {
  return {
    Resources: {
      ...template.Resources,
      ...PROJECTS_TABLE.Resources
    },
    Outputs: {
      ...template.Outputs,
      ...PROJECTS_TABLE.Outputs
    }
  };
}
```

##### Example 2: Modifying a Template

Simply merge the new properties in the template.
You may also use `Object.assign` or any other library to make this look nicer.

```js
export function processCFTemplate(template) {
  return {
    ...template,
    Resources: {
      ...template.Resources,
      myAppAssets: {
        ...template.Resources.myAppAssets,
        Properties: {
          ...template.Resources.myAppAssets.Properties,
          NotificationConfiguration: {
            LambdaConfigurations: [{
              Event: "s3:ObjectCreated:*",
              Filter: {
                S3Key: { Rules: [{
                  Name: "prefix", Value: "uploads/",
                  Name: "suffix", Value: ".doc"
                }] }
              }
              "Function": { "Fn::GetAtt": ["convertToPDF", "Arn"] }
              // in order for s3 to invoke Lambda you should also add the correct AWS::Lambda::Permission
            }]
          }
        }
      }
    }
  };
}
```

Please, do not forget to return the **whole** template object, and not just the new Resources.
