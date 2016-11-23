
Lambda function signature
=========================

Your function should have this signature: `function (event, context) {}`

* `event` will be an object with the following properties:

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
    "expectedResponseContentType": "the value from myfunction.api.responseContentType property"
  },
  "stageVariables" : {
    // this will include all CloudFormation Template Outputs, as listed
    //  by `$ dawson describe`
  }
}
```

* `context` is Lambda's context, untouched
* If `api.noWrap` is `true` in function's configuration, there will be a third param: [`callback`](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback) as you would expect in a vanilla *lambda* function.


#### Whitelisted headers

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
You may add or modify whitelisted headers, see [Customizing a dawson template](./API.md#customizing-a-dawson-template).

Internally, `dawson` uses a [Passthrough Parameter-Mapping Template](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html) to forward request parameters, headers and body to your function.
