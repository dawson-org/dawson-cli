
`package.json` fields
=====================

You must set the **`name`** field in your `package.json`; this `name` will be used as a prefix for all the `CloudFormation` stacks and must be unique in a given AWS account.

Optionally, you can define a `dawson` property, as follows:

* **pre-deploy** (string): a command to execute before starting the deployment. If command exits with status <> 0, the deployment is aborted.
* **post-deploy** (string): a command to run after the deployment has been succesfully completed.
* **zipIgnore** (list of strings): a list of partial paths to ignore when compiling (`babel --ignore`) and when zipping the bundle. **Do not** specify `node_modules` here. 
* **cloudfront** (object: string -> string|boolean, defaults to `{}`): an object which maps app stages to domain names, e.g.:
  ```json
{ "default": "myapp123.com", "test": true, "dev": false }
  ```
  * If `false`, no CloudFront Distribution will be created for that stage.  
  * If `"string"`, a CloudFront Distribution will be created and `"string"` will be set as an [Alias (CNAME)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html).  
  * If `true` (**default** for stages not specified here), a CloudFront Distribution will ben created, without any Alias (CNAME).  
*Please note that updating/creating/deleting CloudFront distributions will take approximately 20 minutes.*  
*Please note that the CNAME must be globally unique in AWS. If the CNAME specified here is already in use, the deployment will fail.*
 
* **route53** (object: string -> string, defaults to `{}`): an object which maps app stages to Route53 Hosted Zone IDs, e.g.:
  ```json
{ "default": "Z187MLBSXQKXXX" }
  ```
  If an Hosted Zone ID is specified, the record corresponding to the CloudFront Alias (CNAME) is created (as an `A` `ALIAS` to the CloudFront distribution).  
  *Please note that the Route53 Hosted Zone must be an Alias' ancestor.*.

* **cloudfrontRootOrigin** (either `assets` or `api`, defaults to `api`):
  * if "assets", use S3 assets (uploaded via `$ dawson upload-assets`) as [Default Cache Behaviour](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesCacheBehavior), i.e.: serve the root directory from S3, useful for Single Page Apps. Requests starting with `/prod` are forwarded to API Gateway.
  * if "api", use your API as Default Cache Behaviour. Requests starting with `/assets` are forwarded to S3 assets bucket.

##### Example
```js
"dawson": {
  "zipIgnore": [
    "frontend"
  ],
  "route53": {
    "default": "Z187MLBSXQKXXX"
  },
  "cloudfront": {
    "default": true
  },
  "cloudfrontRootOrigin": "api"
},
```
