
Function Configuration
======================

Each function exported by the top-level `api.js` **must** have an `api` property.  
The `api` property is used to configure the function behaviour, as described below.

```js
export function foo () {
  // ...
}
foo.api = {
  path: 'message/{messageId}', // required
  authorizer: myAuthorizerFunction
  isEventHandler: false,
  method: 'GET',
  noWrap: false,
  policyStatements: [{
    Effect: "Allow",
    Action: ["dynamodb:Query", "dynamodb:GetItem"],
    Resource: { "Fn::Sub": "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${UsersTable}*" }
  }],
  redirects: false,
  responseContentType: 'text/html',
};
```

#### Required

* *Name:* **`path`**  
  *Required:* yes  
  *Type:* string | `false`  
  The HTTP path to this function, without leading and trailing slashes.  
  The path must be unique in your whole app. You may use path parameters placeholder, as in API Gateway, by sorrounding a parameter name with `{}`).  
  Due to an API Gateway limitation, `/hello/{name}.html` is [**invalid**](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-mappings.html). `/hello/{name}/profile.html` and `/{foo}/bar/{baz}` are valid (*each path part must not contain curly braces, or must both begin and end with a curly brace*).  
  If `false`, no API Gateway method will be deployed.

#### Optional

* *Name:* **`authorizer`**  
  *Required:* no  
  *Default:* undefined  
  *Type:* function  
  A function to use as [API Gateway Custom Authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html) for this endpoint. The authorizer function must be exported from `api.js` and its `isEventHandler` property must be set to `true`. Function's signature and return values matches the [AWS Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html).

* *Name:* **`isEventHandler`**  
  *Required:* no  
  *Default:* `false`  
  *Type:* boolean  
  Set this to `true` if this function will be used as an event handler or as a Custom Authorizer.  
  If `true`, this function will be configured to be called by SNS, S3, DynamoDB Trigger, etc. The API-Gateway specific mappings will not be set. This function will receive `CloudFormation`'s Outputs in an `event.templateOutputs` property.  
  Setting this to `true` makes sense only if `path === false`.

* *Name:* **`method`**  
  *Required:* no  
  *Default:* "GET"  
  *Type:* string  
  HTTP method.

* *Name:* **`noWrap`**  
  *Required:* no  
  *Default:* `false`  
  *Type:* boolean  
  If `true`, this function call won't be wrapped in dawson-specific code. Its return value is ignored, it cannot return a Promise, it won't receive the `event` parameter augmented by dawson. This function will be directly exported as the Lambda handler, thus, it should have this signature: `event`, `context`, `callback`.  
  When this property is true, consider this behaviour:  
  * If `responseContentType` is `text/html`, you must invoke the callback wrapping your response in an `html` property: `callback(null, { html: '<html>....' })`.  
  * If `application/json`, you must invoke the callback wrapping your *stringified* response in a `response` property (e.g.: `callback(null, { response: '"wow"' })`.  
  * Else, you must invoke the callback wrapping your response in a `response` property.
  
* *Name:* **`policyStatements`**  
  *Required:* no  
  *Default:* `[]`  
  *Type:* list of maps  
  List of [IAM Policy Statements](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html) for this Lambda's Role, as you would define in a [CloudFormation template](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-iam-policy.html#cfn-iam-policies-policydocument). `Ref`, `Fn::Sub` and `Fn::GetAtt` is supported. A Statement that allows access to CloudWatch Logs is automatically added.  
  *Example:*
  ```json
  [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::*"
    }
  ]
  ```

* *Name:* **`redirects`**  
  *Required:* no  
  *Default:* `"false"`  
  *Type:* boolean  
  If `true`, dawson expect this function to always return an object with a `Location` key; the HTTP response will then contain the appropriate Location header. Due to limitations in API Gateway, you cannot return any payload and you cannot mix redirecting and non-redirecting responses.

* *Name:* **`responseContentType`**  
  *Required:* no  
  *Default:* `"text/html"`  
  *Type:* string  
  The Content-Type header to set in API Gateway's response. Valid values includes: `application/json`, `text/html`, `text/plain`. When `application/json` is specified, you should return a JSON-serializable object, JSON.stringify will be called automatically. Custom values are allowed.


* ~~**runtime** (string, defaults to `nodejs4.3`): Lambda runtime to use. Only NodeJS runtimes make sense. Valid values are `nodejs` and `nodejs4.3`. You should only use the default runtime.~~

* ~~**keepWarm** (boolean, defaults to `false`): Setting this to `true` will cause your function to be called periodically (~every 2 minutes) with a dummy event. The dummy event is handled internally and your function will be terminated without executing any code. This will improve startup time especially if your endpoints get a low traffic volume. Read [read this post](https://aws.amazon.com/blogs/compute/container-reuse-in-lambda) for more info. An `AWS::Event::Rule` will be created and you'll be [charged](https://aws.amazon.com/cloudwatch/pricing/) (~1$ each million invocations), plus Lambda standard pricing (dummy invocations should average ~1ms).~~
