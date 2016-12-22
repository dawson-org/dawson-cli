**Version: v0.7.1**  

## Usage

### 0. Setup

**Create a `package.json`**  
```json
{
  "name": "helloWorld"
}
```
> You can also run `npm init`. Full configuration reference can be found in the [App Configuration](./App-Configuration) Reference

**Install the dependencies**  
```bash
$ npm install -g dawson babel-cli yarn # can be either global or local deps
$ npm install --save-dev babel-preset-env
```

**Create a `.babelrc`**  
```js
{
  "presets": [["env", { "targets": { "node": 4 }}]],
  "plugins": [] // add any plugin that you may require
}
```

> More details about the required dependencies can be found [here](./npm-Dependencies).

### 1. Code

Create an ```api.js``` file and `export` the functions you want to deploy. Each function *must* have an ```api``` property with at least a ```path```. That's all!

```javascript
// the path "/hello" will display the string "You are awesome"
export function index(params) {
  // you can return promises or strings.
  return '<html><body>You are awesome!</body></html>';
}
index.api = {
  path: 'hello' // no leading slash
};
```

> Complete function definition reference: [Function Definition](./Function-Definition)

### 2. Deploy

> **If you don't have an AWS Account:**
>  1. create an [Amazon Web Services Account](https://console.aws.amazon.com)
>  1. go to *Identity & Access Management*
>  1. create a new *User* with an *Administrator Access Policy*
>  1. once you've created the user take note of the Access Key ID and Secret Access Key that are displayed
>  *Check out this [AWS Guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) for more info.*  

> Point an AWS Region in which you want to deploy to; there's no default Region set. You may use `us-east-1` if you're located in the US or `eu-west-1` if you're located in EU. You need to choose a region in which [AWS Lambda and Amazon API Gateway are supported](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/).

Export the required shell variables: ```AWS_ACCESS_KEY_ID```, ```AWS_SECRET_ACCESS_KEY``` (or `AWS_PROFILE`) and ```AWS_REGION```, then, from your project root:

```bash
$ export AWS_ACCESS_KEY_ID=xxx
$ export AWS_SECRET_ACCESS_KEY=yyy
$ export AWS_REGION=us-east-1
$ dawson deploy
```
*Since dawson, by default, deploys a CloudFront Distribution, the first deployment will take approximately 20 minutes.*

You may need additional dependencies (e.g. `yarn`): `dawson` will display descriptive error messages with further instructions.
The deploy command ends with an HTTPS URL you can immediately visit to run your app. For example, by appending `/hello` to the end, you are invoking the `index` function written before. 

After invoking your functions, you can inspect the execution logs using `$ dawson log -f index`.
You must allow a couple of minutes after the first execution, to allow the Log Group to be created.

> For details check out the [CLI Reference](./CLI-Reference).

Now, learn more from `$ dawson --help` and read the [Documentation](./README.md).
