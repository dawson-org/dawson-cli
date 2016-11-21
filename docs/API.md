
# API Documentation

* [`package.json` fields reference](#packagejson-fields-reference)
* [`api.js` fields specification](#apijs-fields-specification)
  * [Customizing a dawson template](#customizing-a-dawson-template)
* [`Lambda parameters reference`](#lambda-parameters-reference)
  * [CloudFront default whitelisted headers](#cloudfront-default-whitelisted-headers)
* [`function property reference`](#function-property-reference)


---

## `package.json` fields reference

You must set the **`name`** field in your `package.json`; this `name` will be used as a prefix for all the `CloudFormation` stacks and must be unique in a given AWS account.

Optionally, you can define a `dawson` property, as follows:

* **domains** (list of strings): a list of at least one domain name to set as [CloudFront CNAME](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html). Domains must be unique globally in AWS.
* **pre-deploy** (string): a command to execute before starting the deployment. If command exits with status <> 0, the deployment is aborted.
* **post-deploy** (string): a command to run after the deployment has been succesfully completed.
* **zipIgnore** (list of strings): a list of partial paths to ignore when zipping lambdas. **Do not** ignore `node_modules`.
* **cloudfront** (boolean, or object, defaults to `true`): if `false`, the default CloudFront distribution won't be added to the CloudFormation template, so:
   * if you are deploying a new app, the deploy will be very quick, and no distribution will be created
   * if you are updating an app that has been previously deployed with `cloudfront !== false`, the distribution will be  **deleted** (this will take ~20min)
   * if you are referencing the distribution from a custom resource your stack will fail

 You can optionally specify an object which maps app stages to booleans: `{ "dev": false, "prod": true }`

 *This option controls the behaviour of the default CloudFront distribution that dawson creates, and does not apply to any custom resource.*
* **cloudfrontRootOrigin** (either `assets` or `api`, defaults to `api`):
  * if "assets", use S3 assets (uploaded via `$ dawson upload-assets`) as [Default Cache Behaviour](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesCacheBehavior), i.e.: serve the root directory from S3, useful for Single Page Apps. Requests starting with `/prod` are forwarded to API Gateway.
  * if "api", use your API as Default Cache Behaviour. Requests starting with `/assets` are forwarded to S3 assets bucket.

##### Example
```js
"dawson": {
  "domains": [
    "mydomain123.example.com" // required, unique
  ],
  "zipIgnore": [
    "frontend"
  ],
  "cloudfront": true,
  "cloudfrontRootOrigin": "api"
},
```

---

## `api.js` file specification

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

---


## Lambda parameters reference

Your function should have this signature: `function (event, context) {}`


* `event` will follow this spec:

```js
{
  "params": {
    "querystring": {}, // parameters from the querystring
    "path": {}, // path parmeters, captured by `{}` in function `path`s
    "header": {} // some HTTP headers from the client, see below
  },
   // body: the request body (useful only for POST and PUT requests)
   //  currently, only application/json bodies will be parsed
  "body": $input.json('$'),
  "meta": {
    // expectedResponseContentType: the content-type that is expected to be returned
    //  by the function. This is used internally to wrap the returned value
    //  for the API Gateway Method Response.
    "expectedResponseContentType": "the value from fn.responseContentType property"
  },
  "stageVariables" : {
    // this will include all CloudFormation Template Outputs, as listed
    //  by `$ dawson describe`
  }
}
```

* `context` is Lambda's context, untouched
* If `api.noWrap` is `true`, there will be a third param: `callback` as you would expect in a vanilla *lambda* function.


#### CloudFront default whitelisted headers

By default we set CloudFront to only [forward](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/forward-custom-headers.html) these HTTP Headers:
* `Authorization`
* `Accept`
* `Content-Type`
* `Origin`
* `Referer`
* `Access-Control-Request-Headers`
* `Access-Control-Request-Method`

This applies only if you are using the CloudFront distribution endpoint and does not apply if
you are invoking API Gateway directly or via a custom proxy.
You may add or modify whitelisted headers, see [Customizing a dawson template](#customizing-a-dawson-template).


*Internally, `dawson` uses a [Passthrough Parameter-Mapping Template](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html).*

---

## Function property reference

Each function exported by the top-level `api.js` must have an `api` property.

* **path** (*required*, string|false): HTTP path to this function. Must be unique in your whole app. You may use path parameters placeholder, as in API Gateway, by sorrounding a parameter name with `{}` (`/hello/{name}` is valid, `/hello/{name}.html` is [**invalid**](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-mappings.html)). Do **not** include leading/trailing slashes. You can specify `false` to skip deploying the API Gateway endpoint.
* **method** (string, defaults to GET): HTTP method.
* **authorizer** (function): an optional function to use as [API Gateway Custom Authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html) for this endpoint. The authorizer function must be exported from `api.js` and its `isEventHandler` property must be set to `true`.
* **responseContentType** (string, defaults to `text/html`): Content-Type to set in API Gateway's response. Valid values are: `application/json`, `text/html`, `text/plain`. When `application/json`, `JSON.stringify(function_returned_value)` is called to render the response body.
* **policyStatements** (list of maps): Policy statements for this Lambda's Role, as you would define in a [CloudFormation template](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-iam-policy.html#cfn-iam-policies-policydocument).
* **noWrap** (boolean, defaults to `false`): If true, this function call won't be wrapped in a Promise and it will be directly exported as the lambda's handler. It will receive these arguments (may vary based on the runtime): `event`, `context`, `callback`. For `application/json` content type, you *must* invoke the callback passing your stringified response in a `response` property (e.g.: `callback(null, { response: '"wow"' })`. For `text/html` content type: `callback(null, { html: '<html>....' })`.
* **isEventHandler** (boolean, defaults to `false`): if `true`, your function will be called with untouched `event` and `context` parameteres. Set this to `true` if this function will be used as an event handler (S3 Notifications, DynamoDB Streams, SNS etc.) or as a Custom Authorizer. Setting this to `true` makes sense only if `path === false`.
* **runtime** (string, defaults to `nodejs4.3`): Lambda runtime to use. Only NodeJS runtimes make sense. Valid values are `nodejs` and `nodejs4.3`. You should only use the default runtime.
* **keepWarm** (boolean, defaults to `false`): Setting this to `true` will cause your function to be called periodically (~every 2 minutes) with a dummy event. The dummy event is handled internally and your function will be terminated without executing any code. This will improve startup time especially if your endpoints get a low traffic volume. Read [read this post](https://aws.amazon.com/blogs/compute/container-reuse-in-lambda) for more info. An `AWS::Event::Rule` will be created and you'll be [charged](https://aws.amazon.com/cloudwatch/pricing/) (~1$ each million invocations), plus Lambda standard pricing (dummy invocations should average ~1ms).


##### Example
```javascript
export function myFunction() { ... });
// or: export async function myFunction() { ... await ... });

myFunction.api = {
  path: 'message/{messageId}', // required
  method: 'GET',
  responseContentType: 'text/html',
  policyStatements: [{
    Effect: "Allow",
    Action: ["dynamodb:Query", "dynamodb:GetItem"],
    Resource: { "Fn::Sub": "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${UsersTable}*" }
  }],
  runtime: "nodejs4.3",
  noWrap: false,
  isEventHandler: false,
  keepWarm: false
};
```

