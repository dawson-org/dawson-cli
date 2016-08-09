
# Documentation
* [Runtime dependencies](#runtime-dependencies)
* [CLI Reference](#cli-reference)
* [API Documentation](#api-documentation)


## Runtime dependencies

dawson uses babel to transpile your code for the nodejs4.3 runtime. You need to `npm install babel-register babel-polyfill babel-preset-es2017` and create a `.babelrc` file in your root with at least the `es2017` or `es2016` preset.

Example:
```
$ npm install --save babel-register babel-polyfill babel-preset-es2017
$ echo '{"presets":["es2017"]}' > .babelrc
```


## CLI Reference

```bash
$ dawson --help
$ dawson <command> --help
```

## API Documentation

### `package.json` fields specification

You must define a `dawson` property, as follows:

* **appName** (required, string): your app name, used in template and resource names (changing this re-deploys the whole application)
* **domains** (required, list of strings): a list of at least one domain name to set as [CloudFront CNAME](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html).
* **zipIgnore** (list of strings): a list of partial paths to ignore when zipping lambdas. **Do not** ignore `node_modules`.
* **cloudfront** (boolean): if `false`, the default CloudFront distribution won't be added to the CloudFormation template, so:
  * if you are deploying a new app, the deploy will be very quick, and no distribution will be created
  * if you are updating an app that has been previously deployed with `cloudfront !== false`, the distribution will be **deleted** (this will take ~20min)
  * if you are referencing the distribution from a custom resource your stack will fail
 
 *This option controls the behaviour of the default CloudFront distribution that dawson creates, and does not apply to any custom resource.*
* **cloudfrontRootOrigin** (either "assets" or "api"):
  * if "assets", use S3 assets (uploaded via `$ dawson upload-assets`) as [Default Cache Behaviour](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesCacheBehavior), i.e.: serve the root directory from S3, useful for Single Page Apps. Requests starting with `/prod` are forwarded to API Gateway.
  * if "api", use your API as Default Cache Behaviour. Requests starting with `/assets` are forwarded to S3 assets bucket.

**Example:**
```json
{
  "appName": "myapp",
  "domains": [
    "mydomain123.example.com"
  ],
  "zipIgnore": [
    "frontend"
  ],
  "cloudfrontRootOrigin": "assets"
},
```


### `api.js` file specification

TODO


### Lambda parameters reference

TODO


### Function `api` property specification

Each function exported by the top-level `api.js` must have an `api` property.

* **path** (required, string): HTTP path to this functions. Must be unique in your whole app. You may use path parameters placeholder, as in API Gateway, by sorrounding a parameter name with `{}`. Do **not** include leading/trailing slashes.
* **method** (string): HTTP method, defaults to GET.
* **responseContentType** (string): Content-Type to set in API Gateway's response. Valid values are: `application/json` or `text/html` (default).
* **policyStatements** (list of maps): Policy statements for this Lambda's Role, as you would define in a [CloudFormation template](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-iam-policy.html#cfn-iam-policies-policydocument).
* **noWrap** (boolean): If true, this function call won't be wrapped in a Promise and it will be directly exported as the lambda's handler. It will receive these arguments (may vary based on the runtime): `event`, `context`, `callback`. For `application/json` content type, you *must* invoke the callback passing your stringified response in a `response` property (e.g.: `callback(null, { response: '"wow"' })`. For `text/html` content type: `callback(null, { html: '<html>....' })`. Defaults to `false`.
* **runtime** (string): Lambda runtime to use. Only NodeJS runtimes make sense. Valid values are `nodejs` and `nodejs4.3` (default). You are advised to only use the default runtime.

```javascript
export [async] function myFunction() { ... });
myFunction.api = {
  path: 'message/{messageId}',
  method: 'PUT',
  responseContentType: 'application/json',
  policyStatements: [{
    Effect: "Allow",
    Action: ["dynamodb:UpdateItem", "dynamodb:PutItem"],
    Resource: { "Fn::Join": ["", [
      "arn:aws:dynamodb",
      ":", { "Ref" : "AWS::Region" },
      ":", { "Ref" : "AWS::AccountId" },
      ":", "table/", { "Ref": "UsersTable" },
      "*",
    ]] },
  }],
};
```

