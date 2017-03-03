dawson documentation
====================

dawson is a [serverless](https://auth0.com/blog/what-is-serverless/) web framework for Node.js on AWS. dawson uses [AWS CloudFormation](https://aws.amazon.com/cloudformation/), [Amazon CloudFront](https://aws.amazon.com/cloudfront/), [Amazon API Gateway](https://aws.amazon.com/apigateway/) and  [AWS Lambda](https://aws.amazon.com/lambda/) to deploy the backend code and to manage the infrastructure for you. 

### Is dawson for me?
👍 I'm building a single-page app/website with a backend  
👍 I'm building an API   
👍 I'm building a server-rendered app/website  

The main goal of dawson is to be a zero-configuration yet fully extensible *[backend]* web framework for building web apps on AWS. You should be able to start using dawson without creating any configuration file and with only a basic knowledge of Amazon Web Services.

#### tl;dr show me the code!

```js
// api.js
export function greet (event) {
    const name = event.params.path.name
    return `Hello ${name}, you look awesome!`
}
greet.api = {
    path: 'greet/{name}'
}
```
```bash
$ # 🛑 we strongly recommend to read this guide 🛑
$ # 🛑     before getting your hands dirty      🛑
$ npm install -g dawson
$ export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
$ dawson deploy
```

Check out the [examples repository](https://github.com/dawson-org/dawson-examples)!


# Table of Contents

<!-- toc -->

- [0. Working with AWS](#0-working-with-aws)
  * [0.1 obtaining AWS Credentials: short version](#01-obtaining-aws-credentials-short-version)
  * [0.2 obtaining AWS Credentials: long version for AWS beginners](#02-obtaining-aws-credentials-long-version-for-aws-beginners)
- [1. Getting to know dawson](#1-getting-to-know-dawson)
  * [1.1 installing](#11-installing)
  * [1.2 package.json and entry point](#12-packagejson-and-entry-point)
  * [1.3 the dawson CLI](#13-the-dawson-cli)
  * [1.4 Templates and built-in Resources](#14-templates-and-built-in-resources)
  * [1.5 working with *stage*s](#15-working-with-stages)
  * [1.6 deployment speed](#16-deployment-speed)
- [2. Working with functions](#2-working-with-functions)
- [3. Function programming model](#3-function-programming-model)
  * [3.1 Parameters](#31-parameters)
    + [3.1.1 Accessing Template Outputs and Custom Resources](#311-accessing-template-outputs-and-custom-resources)
    + [3.1.2 Supported HTTP request headers](#312-supported-http-request-headers)
  * [3.2 Returning a value](#32-returning-a-value)
    + [3.2.1 Returning an HTTP redirect](#321-returning-an-http-redirect)
    + [3.2.2 Returning an error response](#322-returning-an-error-response)
  * [3.3 Example functions](#33-example-functions)
- [4. Function configuration](#4-function-configuration)
  * [`path`](#path)
  * [`method`](#method)
  * [`responseContentType`](#responsecontenttype)
  * [`authorizer`](#authorizer)
  * [`policyStatements`](#policystatements)
  * [`redirects`](#redirects)
  * [`devInstrument`](#devinstrument)
- [5. Application configuration](#5-application-configuration)
  * [`pre-deploy`](#pre-deploy)
  * [`post-deploy`](#post-deploy)
  * [`ignore`](#ignore)
  * [`root`](#root)
  * [`route53`](#route53)
  * [`cloudfront`](#cloudfront)
  * [`assetsDir`](#assetsdir)
  * [5.1 SSL/TLS Certificates](#51-ssltls-certificates)
- [6. Working with the Template](#6-working-with-the-template)
  * [6.1 Adding custom resources](#61-adding-custom-resources)
  * [6.2 Modifying dawson-managed resources](#62-modifying-dawson-managed-resources)
- [7. Working with the Development Server](#7-working-with-the-development-server)

<!-- tocstop -->

# 0. Working with AWS

dawson requires Amazon Web Services credentials to operate. dawson needs the following environment variables:
- either `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`
- or `AWS_PROFILE` (with `AWS_REGION` if you're not using the profile's default region)

> **These credentials will be only used by dawson to create/update the CloudFormation Stack and to call sts.AssumeRole when using the *Development Server*. None of your app code will run with these credentials.**

As a safety measure, dawson uses a mechanism to prevent accidental deletion or replacement of *some* resources, which could result in data loss, DNS changes etc, unless the --danger-delete-resources CLI option is specified. Trying to perform some operations, such as deleting S3 Buckets, REST APIs, DynamoDB Tables, CloudFront Distributions will result in an error unless this flag is specified

## 0.1 obtaining AWS Credentials: short version
Create an IAM user with `AdministratorAccess` permissions (be sure to create an Access Key), then create a profile with the given credentials (or export them as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`).  

> Since we use the `aws-sdk-js`, any other method of setting credentials should work and can be used (e.g. EC2 Instance Role).

> The CloudFormation Stack will contain IAM Roles, so dawson will request a stack creation using CAPABILITY_IAM; since you may need to add named IAM Resources, we have included CAPABILITY_NAMED_IAM by default. IAM is managed only via CloudFront and we're not creating any other resource outside of the Template.

## 0.2 obtaining AWS Credentials: long version for AWS beginners

1. create an Amazon Web Services Account or login into an existing account
2. from the top menu, choose Services and find *Identity & Access Management* (short: IAM)
3. choose Users from the left menu and click on Add User
4. enter an username (for example: *my-dawson-project*) and check the "Programmatic access" box. Click next.
5. click on "Attach existing policies directly" and search for a Policy named "AdministratorAccess", click next and confirm
6. the confirmation page will show a table with the credentials; you must write down the values of "Access key ID" (which usually starts with `AKIA`) and "Secret access key". Keep in mind that the value for Secret access key won't be shown again after you leave this page
7. find an AWS Region in which you want to work; there's no default Region set. You may use `us-east-1` if you're located in the US or `eu-west-1` if you're located in EU. You need to choose a region in which AWS Lambda and Amazon API Gateway are supported, for more info check out the [AWS Region Table](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/).
7. from a terminal window your PC, which you'll use to run the dawson command, you may run:
```bash
export AWS_ACCESS_KEY_ID=...
export SECRET_ACCESS_KEY=...
export AWS_REGION=...
```

> You can find more information about AWS IAM Credentials here: https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys

> There are many other ways to set AWS Credentials on your PC, you may refer here for more info: https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html 

---

# 1. Getting to know dawson

You write your app's code and then dawson takes care of building, packing, uploading the code to AWS and of creating the AWS infrastructure that your application needs to run.

## 1.1 installing
you should install dawson using npm or yarn: `npm install -g dawson` or `yarn global add dawson`. You should then be able to run a `dawson --help` command.  
You're kindly invited to keep dawson up-to-date, starting with `v1.0.0` we will never introduce backwards-incompatible changes between non-major versions, following strict [SemVer](http://semver.org).  

There are some system prerequisites; the following binaries must be available:

* `npm`
* `zip`
* `docker` (for running the development server)


## 1.2 package.json and entry point
dawson reads the contents of a file named `api.js` in your current working directory. You should write (or just `export`) your functions in this `api.js` file.  
dawson uses the `name` field in the `package.json` file in your current working directory to determine the app name, which will be used as a prefix for many AWS Resources that are created automatically. Make sure you have correctly set the `name` field it's *not possible to change* it later.

## 1.3 the dawson CLI
dawson ships a few commands that you should use to manage your application, here's a brief overview. Up-to-date reference for commands and arguments may be accessed using `$ dawson --help`.

`$ dawson deploy` creates or updates the whole infrastructure and deploys your application  
`$ dawson log -t -f <function>` pulls function's logs from AWS in real time  
`$ dawson describe` list all of the Resources that have been deployed  
`$ dawson dev` starts a **development server**  

## 1.4 Templates and built-in Resources
When you run the `$ dawson deploy` command, dawson reads your file's contents and constructs a (*JSON*) description of the AWS infrastructure that needs to be created (functions, API endpoints, etc...). Such description is called **Template**. The Template is then uploaded to AWS, which performs the actual deploy. AWS takes care of creating resources, calculating changes and to perform the actual deployment.  

> Some Template components respects the NODE_ENV variable. Set `NODE_ENV = production` when deploying to a production environment. For example, stages deployed with `NODE_ENV = production` cannot be used with `$ dawson dev`.

**The description will contain the following Resources:**

- one [API Gateway REST API](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-restapi.html)
    - plus, one [API Gateway Stage](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-stage.html)
    - plus, one [API Gateway Deployment](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-deployment.html)
    - plus, one [API Gateway Account](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-account.html) (plus one Execution Role)
- one *Public Assets* [S3 Bucket](https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingBucket.html) is created and your **static assets** (css, js, images, html, ...) are uploaded there; dawson calls it **`BucketAssets`**. Content of this bucket is *public-read*able.  
- one [CloudFront Distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html) (*like a CDN*) is created and is configured to serve the static assets from the S3 Bucket and the API Endpoints from API Gateway; dawson calls it **`DistributionWWW`**  
    - plus, one [AWS ACM Certificate](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html) if you have set a Custom Domain (CNAME) - *currently, AWS ACM is not managed via CloudFront due to an AWS limitation*
    - plus, one [Route53 RecordSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-route53-recordset.html) if you have specified a hostedZoneId
    - plus, one [AWS WAF WebACL](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-waf-webacl.html) ([pricing](https://aws.amazon.com/waf/pricing/)) if you deploy with `NODE_ENV = production`
- for each function that you *export*:
    - an [AWS Lambda Function](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html)  
        - an [IAM Role](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-role.html) and [IAM Policy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-policy.html) (Execution Role)
        - a [Lambda Permission](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-permission.html) (to allow API Gateway to call this Function)
    - *[if the function's path is specified]* an [API Gateway HTTP Endpoint](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-create-api-step-by-step.html)
        - the related [Model](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-model.html), [Method](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-method.html), [Resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-resource.html),  [Authorizer*](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-authorizer.html)
- [user-defined Resources](#61-adding-custom-resources)
- dawson's support Resources, in a separate stack - *one for each Region that has at least one stage*

*Reference architecture:*
![](https://rawgit.com/dawson-org/dawson-cli/images/architecture.png)

> You can add more Resources as you need and fully customize even Resources that are managed by dawson.  
Internally, dawson is building and deploying [CloudFormation Stack](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-guide.html).

## 1.5 working with *stage*s
You may want to have more than one deployment for your app, for example you might want to create separate *development* and *production* deployments: you can use the `--stage` parameter when running dawson (or set a `DAWSON_STAGE` environment variable) to tell dawson which stage to operate on. By default, dawson uses a stage named `"default"`.
Stages are completely isolated one to each other and they may also have different configurations, including different domain names.

## 1.6 deployment speed
The *first deployment* will be very slow because many resources needs to be created (including a CloudFront distribution) and it will take anything between *15 to 45 minutes*. You can safely kill (Ctrl-C) the dawson command once it says "waiting for stack update to complete".
Subsequent deploys will *usually take around 2-5 minutes* or more, depending on which Resources need to be created and updated.

---

# 2. Working with functions

**dawson deploys functions to the cloud and optionally makes them available via HTTP(S).**
If this statement looks weird to you, you may want to check out the following beginners-friendly articles:
- https://www.quora.com/What-are-serverless-app (short)
- https://martinfowler.com/articles/serverless.html (long)
- https://aws.amazon.com/lambda/serverless-architectures-learn-more/ (PDF)
- https://docs.aws.amazon.com/lambda/latest/dg/lambda-introduction.html and https://aws.amazon.com/api-gateway/details/ (suggested readings)

**Usually, a Function, in dawson's terms, is an handler for an HTTP request *(much like a route in a koa/express app)*, which takes incoming parameters (such as HTTP Body, Querystring, etc) and returns an output to be displayed in a browser.**

You should place all of your functions in a file named `api.js` (or you might define them elsewhere and just `export`). The `api.js` file will be parsed and automatically transpiled using `babel` so you can use any JavaScript language feature that's supported by [`babel-preset-env`](https://github.com/babel/babel-preset-env), including ES6 Modules, ES7 `Array.prototype.includes` etc.

Each function in the `api.js` file **must** have an `api` property, which tells dawson some information about your function's behaviour; more on this in the *Configuring functions* chapter.

All the lines logged by your functions (via `console.log`, `console.error`, `process.stdout.write` etc...) will be automatically delivered to [Amazon CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html), a persistent and searchable Log Storage. Logs can be later fetched or streamed using `$ dawson logs`.

**Function example: returning an HTML page**
```js
// an helloWorld function will be created which, when invoked,
// will return an HTML string
export function helloWorld (event) {
    console.log('this function was called with this parameter:', event);
    return `
        <html>
            <body>
                <h1>hello world</h1>
            </body>
        </html>
    `;
}
helloWorld.api = {
    path: 'hello', // the HTTP path to attach this function to
    method: 'GET'  // & the HTTP method
};
```

**Function example: returning a JSON Object**
```js
// an helloWorld function will be created which, when invoked,
// will return a JSON string. The returned object will be automatically
// serialized using JSON.stringify(...)
export function helloWorld (event) {
    console.log('this function was called with this parameter:', event);
    return { hello: 'world' };
}
helloWorld.api = {
    path: 'hello', // the HTTP path to attach this function to
    method: 'GET', // & the HTTP method (defaults to GET)
    responseContentType: 'application/json'
                   // & the Content-type (defaults to 'text/html')
};
```

---

# 3. Function programming model

## 3.1 Parameters

Given a generic function definition:
```js
function helloWorld (event, context) { /* ... */ }
helloWorld.api = {
    path: 'xyz'
};
```

If `api.path === false`, the `event` parameter will be exactly the event Object that the Lambda receives from other AWS services. Typically, you set `path: false` when this Function is used as an AWS Event handler (for processing events from DynamoDB Streams, Kinesis Streams, S3 Events, CloudWatch Events, etc.); in this case, no HTTP Endpoint will be created.

If `api.path !== false`, the Function expects to be called via an HTTP Request and the `event` parameter will be an Object with the following properties:
```js
{
  "params": {
    "querystring": {}, // parameters from the querystring
    "path": {}, // path parmeters, captured by `{}` in function `path`s
    "header": {} // some HTTP headers from the client, see below
  },
   // body: the request body (useful only for POST and PUT requests)
   //  currently, only application/json and application/www-form-urlencoded bodies will be parsed
  "body": Object | string,
  "meta": {
    // expectedResponseContentType: the content-type that is expected to be returned
    //  by the function. This is used internally to wrap the returned value
    //  for the API Gateway Method Response.
    "expectedResponseContentType": "the value from api.responseContentType property"
  },
  "stageVariables" : {
    // API Gateway's Stage Variables if you set any of them,
    // empty by default
  }
}
```

The second parameter, `context`, is [Lambda's Context](https://docs.aws.amazon.com/lambda/latest/dg/programming-model-v2.html). You should rarely need to access this property. **Do not call** ~~`context.done`~~, ~~`context.fail`~~ or ~~`context.succeed`~~.

### 3.1.1 Accessing Template Outputs and Custom Resources
Additionally, every function has access to a `process.env` Object.  
dawson sets the following properties:
* **`NODE_ENV`** will match the value of `process.env.NODE_ENV` that was set when executing `$ dawson deploy`
* **`DAWSON_BucketAssets`** the Physical Resource Name of the S3 Bucket that contains the static assets
* **`DAWSON_WWWDistribution`** the CNAME (DNS name) of the CloudFront Distribution
* each of the Template Outputs, including custom Outputs, as `DAWSON_<OutputName>`. For Example, a custom Output named `FooBar`, will be available from your Functions as `process.env.DAWSON_FooBar` (Output Name's CaSe is preserved).

See Chapter 6 for details about referencing Custom Resources.

### 3.1.2 Supported HTTP request headers

By default only these HTTP Request Headers are  [forwarded](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/forward-custom-headers.html):
* `Authorization`
* `Accept`
* `Content-Type`
* `Origin`
* `Referer`
* `Access-Control-Request-Headers`
* `Access-Control-Request-Method`

You may add or modify whitelisted headers, see the "Working with templates" chapter.

> Internally, `dawson` uses a [Passthrough Parameter-Mapping Template](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html) to forward request parameters, headers and body to your function.

## 3.2 Returning a value

A function can return:
* a `string`, which will be returned as-is as the HTTP response;
* an `Object`, which will be JSON.stringified and returned as the HTTP response (note that returning an object makes sense only if `api.responseContentType === "application/json"`);
* a `Promise`, which fulfills with any of the previous types;   
  **you can also declare your function as `async` and use `await` in it!**

Currently, functions can not modify HTTP Response Headers.

### 3.2.1 Returning an HTTP redirect

To respond with an HTTP Redirect (with an HTTP Status equal to `307 Temporary Redirect`), you must return an Object with a `Location` property. Additionally, the `api.redirects` configuration property must also be set to `true`.

```js
function myRoute () {
    // your logic, including await etc...
    return { Location: 'http://www.google.com' };
}
myRoute.api = {
    redirects: true
};
```

> Due to limitations in API Gateway, you cannot return any payload and you cannot mix redirecting and non-redirecting responses.

### 3.2.2 Returning an error response

When a function fails and an error occurs, you can throw an `Error` or return a rejecting `Promise`.
dawson hides all uncaught Errors and will not leak any information about it. The Client (either a browser or any other HTTP agent) will receive a generic `HTTP 500 Internal Server Error`.

You may obviously want to return expected (i.e. *Handled*) errors to the client, instead.
dawson supports custom error responses, using the following model:

Instead of 
~~```throw new Error('I wanted to throw a 403 error')```~~ you should write:
```js
throw new Error(JSON.stringify({
  httpStatus: 403, // int
  response: 'I am throwing a 403 error' // string
}));
// Note that the Error constructor accepts just a String as first argument,
// so you need to use JSON.stringify.
```

When returning an Error like such, the specified `httpStatus` HTTP Status Code will be set on the Response and:

* if `responseContentType === "application/json"`, the whole error payload is JSON.stringified and returned as the HTTP response
* in all other cases, the `response` property is returned as the HTTP response

Currently, dawson supports the following httpStatus codes: `400`, `403`, `404`, `500` (using other Status Codes will result in an API Gateway Internal Error).

## 3.3 Example functions

```js
// 3.3.1 a basic function
export function index (params) {
  console.log('Called with', params)
  return `<html><body><marquee>I love Marquees</marquee></body></html>`
}
index.api = {
  path: ''
}
```
```js
// 3.3.2 a basic function returning a JSON Object
export function fetchMe (params) {
  return {
    my: 'data'
  }
}
fetchMe.api = {
  path: 'fetchMyJSON',
  responseContentType: 'application/json'
}
```
```js
// 3.3.3 a function returning a Promise
export function fetchAsync (params) {
  return new Promise((resolve, reject) => {
    // ...
    resolve('<html><body><center>Bar Baz</center></body></html>')
  })
}
fetchAsync.api = {
  path: 'fetchSomething'
}
```
```js
// 3.3.4 a more complex function which uses async/await
// (api properties are explained in the next chapter)
export async function listProjects(event) {
  const tableName = process.env.DAWSON_TableMyProjects;
  const response = await dynamodb.scan({
    TableName: tableName
  }).promise();
  return {
    projects: response.Items
  };
}
listProjects.api = {
  path: 'projects',
  responseContentType: 'application/json',
  policyStatements: [{
    Effect: "Allow",
    Action: ["dynamodb:Scan"],
    Resource: { 'Fn::GetAtt': ['TableMyProjects', 'Arn'] }
  }]
};
```
```js
// 3.3.5 a basic event handler
export function index (params) {
  console.log('Called with', params)
  return;
}
index.api = {
  path: false // no HTTP endpoint will be deployed
}
```

---

# 4. Function configuration

Each function exported by the `api.js` file **must** have an `api` property.  
The `api` property is used to configure the function behaviour, as described below:

```js
export function foo () { /* ... */ }
foo.api = {
  path: 'message/{messageId}', // required!
  authorizer: myAuthorizerFunction,
  method: 'GET',
  policyStatements: [{
    Effect: 'Allow',
    Action: ['dynamodb:Query', 'dynamodb:GetItem'],
    Resource: [{ 'Fn::Sub': 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${UsersTable}*' }]
  }],
  redirects: false,
  responseContentType: 'text/html',
};
```

## `path`
**Required**: yes | **Type**: `string`|`boolean`
**Use for**: Specifying an HTTP path 

The HTTP path to this function, *without* leading and trailing slashes.  
The path must be unique in your whole app. You may use path parameters placeholder, as in API Gateway, by sorrounding the parameter name with `{}`).  
If `false`, no API Gateway method will be deployed (see [Function Parameters](./Function-Parameters) for details).  

>  Due to an API Gateway limitation, `/hello/{name}.html` is [**invalid**](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-mappings.html). `/hello/{name}/profile.html` and `/{foo}/bar/{baz}` are valid (technically, "*each path part must not contain curly braces, or must both begin and end with a curly brace*").  

## `method`
**Required**: no | **Type**: `string` | **Default**: `"GET"`  
**Use for**: Specifying an HTTP Method 

## `responseContentType`
**Required**: no | **Type**: `string` | **Default**: `"text/html"`  
**Use for**: Specifying a value for the `Content-type` HTTP Response Header

The `Content-type` header to set in the HTTP Response. Valid values includes: `application/json`, `text/html`, `text/plain`, etc. When `application/json` is specified, you should return a JSON-serializable object, JSON.stringify will be called automatically. Custom values are also allowed. Binary data might be corrupted (until AWS Api Gateway will support setting Binary Responses via CloudFormation).

## `authorizer`
**Required**: no | **Type**: `function` | **Default**: `undefined`  
**Use for**: Specifying an API Gateway Custom Authorizer to attach to this function

A function to use as [API Gateway Custom Authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html) for this endpoint. The authorizer function must be exported from `api.js` as well and its `path` property must be set to `false`. Function's signature and return values matches the ones defined in the [related  documentation on AWS](https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html).

## `policyStatements`
**Required**: no | **Type**: `list of maps` | **Default**: `[]`  
**Use for**: Specifying AWS permissions for this function

When accessing resources on AWS (e.g. upload something to an S3 Bucket, insert or query a DynamoDB Table etc...), your functions need the permission to perform such operation. These permissions are granted using AWS Identity & Access Management (AWS IAM) Role Policies. More info:
- https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies.html
- https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html#genref-arns
- https://docs.aws.amazon.com/AmazonS3/latest/dev/s3-arn-format.html

You can specify a list of [IAM Policy Statements](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html) to set for this Lambda's Role, as you would define in a [CloudFormation template](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-iam-policy.html#cfn-iam-policies-policydocument). `Ref`, `Fn::Sub` and `Fn::GetAtt` are supported.  

The value of this property is directly injected in the CloudFormation Template, so you should refer to its Resources using [`Ref`, `Fn::Sub` and `Fn::GetAtt`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html) instead of hardcoding ARNs. Currently, the best way to obtain a Resource's Logical Id is to use the `$ dawson describe` command or to inspect the stack from the AWS Console.

A Statement that allows access to CloudWatch Logs is automatically added.  

️☠️ **Do not harcode Physical Resource IDs nor ARNs of resources that are in any CloudFormation Stack. They will change and will break your infrastructure. Use Ref, GetAtt and Sub to refer to Logical IDs instead.** ☠️

**Example**
```js
[{
    "Effect": "Allow",
    "Action": ["s3:PutObject"],
    "Resource": [{ 'Fn::Sub': 'arn:aws:s3:::${BucketAssets}/*' }]
}, {
    Effect: 'Allow',
    Action: ['dynamodb:Query', 'dynamodb:GetItem'],
    Resource: [{ 'Fn::Sub': 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${UsersTable}*' }]
}]
```

## `redirects`
**Required**: no | **Type**: `boolean` | **Default**: `false`  
**Use for**: Sets wether a function is expected to return a `307 Temporary Redirect` or not

If `true`, dawson expect this function to **always return** an Object with a `Location` key. The HTTP response will then contain the appropriate `Location` header.

> Due to limitations in API Gateway, you cannot return any payload when redirecting and you cannot mix redirecting and non-redirecting responses for the same function (i.e.: either a function always redirects or it never does)

**Example**
```js
// a simple function that returns an HTTP redirect to https://google.com
export function index (params) {
  return { Location: 'https://google.com' }
}
index.api = {
  path: 'something',
  redirect: true
}
```

## `devInstrument`
**Required**: no | **Type**: `boolean` | **Default**: `false`  
**Use for**: running event-handling Functions locally

This option can be useful to test from the Development Server, Functions that run in response to non-HTTP events (such as S3 Events).  
If `true`, Events generated on AWS will be piped locally to this Function.

dawson pipes any [event supported by Lambda](https://docs.aws.amazon.com/lambda/latest/dg/invoking-lambda-function.html) other than API Gateway's events, such as events coming from the following services:
* Amazon S3
* Amazon DynamoDB
* Amazon Kinesis Streams
* Amazon Simple Notification Service
* Amazon Simple Email Service
* Amazon Cognito
* AWS CloudFormation
* Amazon CloudWatch Logs
* Amazon CloudWatch Events
* AWS CodeCommit
* Scheduled Events (powered by Amazon CloudWatch Events)
* AWS Config
* Amazon Echo
* Amazon Lex

> To ensure that each event is not processed both by AWS Lambda and by the Development Server, when this option is set to `true` this AWS Lambda Function is configured to ignore any Event she receives.  
> Unless you know what you're doing, setting this option to `true` in production is not a good idea.

This option can only be set when `path === false`, as it makes no sense to use this when an API Gateway Endpoint is present.

---

# 5. Application configuration

If the default settings does not fit your use case, you can configure dawson's behaviour by adding a `dawson` property in the `package.json` file:

```js
{
  "name": "appname", // required and unique in an AWS Account
  // other package.json fields...
  "dawson": {
    "ignore": [
      "frontend"
    ],
    "route53": {
      "default": "Z187MLBSXQKXXX"
    },
    "root": "api",
    "assetsDir": "assets",
    "cloudfront": {
      "default": true,
      "production": "myapp.com",
      "bar": false
    }
  }
}
```

You must set at least the **`name`** field in your `package.json`; this `name` will be used as a prefix for all the `CloudFormation` stacks and must be unique in a given AWS account. It's not possible to change the `name` after you have deployed your app.

Optionally, you can define a `dawson` property as an Object with the following properties:

## `pre-deploy`
**Required**: no | **Type**: `string` | **Default**: `undefined`  
**Use for**: Specifying a bash command to run before the deployment begins

A shell command to execute before starting the deployment. If command exits with status <> 0, the deployment is aborted.

## `post-deploy`
**Required**: no | **Type**: `string` | **Default**: `undefined`  
**Use for**: Specifying a bash command to run before the deployment begins

A shell command to run after the deployment has been successfully completed.

## `ignore`
**Required**: no | **Type**: `Array<string>` | **Default**: `[]`  
**Use for**: Specifying files to not include in the ZIP bundle which is uploaded to AWS Lambda

A list of partial paths to ignore when compiling, when zipping the bundle and when watching files for changes.  
Paths should begin with `*` unless they're absolute (see [zip man page](https://linux.die.net/man/1/zip)).
**Do not** specify `node_modules` here, it is already ignored when needed.  

## `root`
**Required**: no | **Type**: `"api" | "assets"` | **Default**: `api`  
**Use for**: Specifying wether the root ("/") path of your app serves the contents from the `assets/` folder or from the API

This option controls the [behaviour](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesCacheBehavior) of the CloudFront distribution and the development server.
  * if `"assets"` (typically for *Single Page Apps*), all requests are served using the S3 Assets Bucket contents, except requests starting with `/prod` which are forwarded to your APIs.
  * if `"api"` (typically for *APIs* or *Server-Rendered pages*), all requests are forwarded to your APIs, except requests starting with `/assets` which are served using the S3 Assets Bucket contents.  
  When forwarding requests to the S3 Assets Bucket, the `/assets` prefix will not be stripped: you need to have an `assets` folder at top level in your bucket. At the opposite, when forwarding requests to your API, the `/prod` prefix will be stripped (because it references API Gateway's Stage).  
  On startup, the development server prints these mappings so you can check that you've properly configured everything.

## `assetsDir`
**Required**: no | **Type**: `string|boolean` | **Default**: `"assets"`  
**Use for**: Specifying the path to the folder containing public assets (if any)

Specify a path, relative to the package.json directory, in which public assets (css, img, js, etc.) are located. Dawson recursively uploads file and folders (except hidden files) to the `BucketAssets`.
By default, if this property is not specified, dawson expects to find public assets in the `__dirname + /assets/` folder.  
Another common value for this property might be something like `frontend/dist/` if you have a build process in place.  
The folder must exist when dawson start.  
Specify `false` to skip deploying assets.  

## `route53`
**Required**: no | **Type**: `Object<string:string|boolean>` | **Default**: `{}`  
**Use for**: Specifying Route53 Zone IDs to link to your CloudFront Distributions

An object which maps app stages to Route53 Hosted Zone IDs. If an Hosted Zone ID is specified, the DNS Record corresponding to the CloudFront Alias (CNAME) is created (as an `A ALIAS` to the CloudFront distribution). Needless to say, he Route53 Hosted Zone must be an Alias' ancestor or the deployment will fail.  

## `cloudfront`
**Required**: no | **Type**: `Object<string:string|boolean>` | **Default**: `{}`  
**Use for**: Specifying wether to deploy a CloudFront distribution in front of your API (*recommended*) or not.

An Object which maps app stages to optional domain names.  
Keys are *stage names* (see *Working with Stages* above, `"default"` is the default stage if you do not specify `--stage`).
  * When the value is `false`, no CloudFront Distribution will be created for that stage.  
  * When the value is `true` (which is the default behaviour for stages not specified in this Object), a CloudFront Distribution will be created without any Alias (CNAME) and can be accessed using the usual https://dNNNNNNNNN.cloudfront.net URL.  
  * When the value is a valid domain name (`"abc.string.com"`), a CloudFront Distribution will be created and `"abc.string.com"` will be set as a Custom Domain Name (aka CNAME, or [Alias (CNAME)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)). The CNAME that you specify must be **globally unique in AWS**. If the CNAME specified here is already in use the deployment will fail. *An SSL/TLS certificate might be requested for this domain, see below for details.*
  
> If changing this setting will result in updating, creating or deleting a CloudFront Distribution, the deployment will take approximately 15-20 minutes.  

> We choose to serve contents only via HTTPS. A TLS certificate might be automatically requested by dawson using AWS ACM. See the next section for details.

## 5.1 SSL/TLS Certificates

If you specify a custom domain (Alias, CNAME) in the cloudfront property, the following behaviour will apply:

1. dawson searches your Account for AWS ACM certificates that are valid for the custom domain specified for the current stage
2. if a certificate is found, it will be associated to this Distribution and the deployment continues
3. if no valid certificate is found, a new SSL/TLS certificate will be requested and the deployment will be aborted. Instructions for certificate validation will be printed to the console; usually, domain contacts and some admin e-mail accounts will receive an email with a validation link. You can find more information on the validation process in the [Validate Domain Ownership](https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-validate.html) page.

If you don't want to request an SSL/TLS certificate you can specify the `--skip-acm` flag with every deploy command. Please be aware that specifying the `--skip-acm` flag when a certificate has been already requested and attached to a CloudFront Distribution will result in such certificate to be disassociated from the Distribution (~20 minutes to deploy).

> **Notes on the current implementation**  
  - dawson does not manage AWS ACM Certificates via CloudFormation due to an AWS Region limitation
  - AWS ACM Certificates for CloudFormation will be created in the us-east-1
  - dawson never deletes AWS ACM Certificates and won't request a new certificate if a valid one is found


# 6. Working with the Template

As we introduced above, the Template is a textual (JSON) representations of all the Resources that compose your infrastructure. The Template is a pure [AWS CloudFormation Template](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-guide.html), which you can fully customize.

As you may know, each CloudFormation Template is composed by a `Resources` and an `Outputs` properties. Outputs contains a map to values that external Resources can access.

## 6.1 Adding custom resources
Sooner or later, you'll probably need to add more Resources to your infrastructure, such as DynamoDB Tables, S3 Buckets, SQS Queues, SNS Topics, etc. dawson provides a method to add custom resources to the Template that will be deployed to AWS.

Define and export a function named `customTemplateFragment` from the `api.js` file; this function takes two parameters and must return an Object, which dawson will merge its Resources on.

There's no particular restriction on what resources you can add here, just keep in mind that:
- you have no access to the Template generated by dawson (because it's actually not yet *created*)
- you must avoid circular dependencies between resources
- if you are defining more than 5 DynamoDB Tables, the first creation will fail with a message saying that there are too many indexes being provisoned. You should add dependencies between Tables using the DependsOn property to force CloudFormation to deploy them serially and not in parallel
- if you add an API Gateway Method, you should update the `<deploymentLogicalName>.DependsOn` list to include such method's Logical Name (what?! more [here](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-deployment.html), scroll down to "Method Dependency", ask me if unclear), otherwise you'll get a cryptic error from CloudFormation / API Gateway. `deploymentLogicalName` is available as `deploymentLogicalName` property on `cutomTemplateFragment`'s second parameter

**You may check out dawson's [ready to use Resources Snippets](https://github.com/dawson-org/dawson-snippets).**

**Example**
```js
export function customTemplateFragment(currentTemplate, dawsonInternalVariables);
 // currentTemplate = {} -- because this function is called before processing anything
 // dawsonInternalVariables = {
 //   deploymentLogicalName: `<RANDOM STRING>`
 // }
 return {
    Resources: {
        BucketVideos: {
            // create a new Bucket with BucketVideos as Logical Name
            Type: 'AWS::S3::Bucket'
        }
    },
    Outputs: {
        // publishes the BucketVideos' Physical Name (the actual AWS Resource Name)
        // so it's available as
        // process.env.DAWSON_BucketVideos
        // in every Function
        BucketVideos: { Value: { Ref: 'BucketVideos' } }
    }
 };
}
```

Please **do not hardcode Resource IDs** in your code. **They will change and will break your application**. Always set an Output and access the Physical Resource Id from `process.env`. It's also tempting to use developer-provided names for resources such as DynamoDB Tables and S3 Buckets: don't; it will probably break the built-in Stages support.

> The full Template Reference is available in the [AWS CloudFormation User Guide](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-reference.html).
> You may check out dawson's [ready to use Resources Snippets](https://github.com/dawson-org/dawson-snippets).
> You can use `Fn::GetAtt`, `Fn::Sub`, `Ref` etc to reference other resources in this Template.


## 6.2 Modifying dawson-managed resources
You can modify every part of a Template, overriding dawson's configuration.  

Define and export a function named `processCFTemplate` from the `api.js` file; this function takes the Template Object right before dawson deploys it and must return an updated Template Object.

There's one gotcha: you **can not add or modify `Outputs`** using this function.

**Example**
```js
import merge from 'lodash/merge'; // you can use any implementation of (deep) merge, or just merge "by hand"

export function processCFTemplate (template) {
    return merge(template, {
        Resources: {
            BucketAssets: {
                Properties: {
                    /* sets the contents of BucketAssets to private, otherwise public by default */
                    AccessControl: 'Private'
                }
            }
        }
    });
}
```

> The full Template Reference is available in the [AWS CloudFormation User Guide](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-reference.html).
> You can use `Fn::GetAtt`, `Fn::Sub`, `Ref` etc to reference other resources in this Template.

> Technically, you *could* add or modiffy Outputs using this function; they just won't be availabe to Functions via `process.env.DAWSON_xxx`, because it's too late for them to be added to the `Environment` property in CloudFormation.

---

# 7. Working with the Development Server

TODO

```bash
$ dawson dev --help
```

