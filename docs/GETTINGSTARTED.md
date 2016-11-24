
## Usage

### 0. Install

```
$ npm install -g dawson
```

#### Required `dependencies`
* `babel-polyfill`

#### Required `devDependencies`
* `babel-register`
* `babel-cli`
* `babel-plugin-transform-runtime`

Additionally, you need a `.babelrc` file, with at least the `transform-runtime` plugin:

```json
{
  "plugins": [
    "transform-runtime"
  ],
  "presets": [
    "es2017",
    "es2015"
  ]
}
```


### 1. Code

Create a `package.json` and set, at least, the `name` field.

Create an ```api.js``` file and export the functions to deploy.  
Each function *must* have an ```api``` property with at least a ```path```.  
*That's it!*

```javascript
// the path "/hello" will display the string "You are awesome"
export function index(params) {
  // you can return promises or strings.
  return '<html><body>You are awesome!</body></html>';
}
index.api = {
  path: 'hello', // no leading slash
};
```


### 2. Deploy

Export ```AWS_ACCESS_KEY_ID```, ```AWS_SECRET_ACCESS_KEY``` (or `AWS_PROFILE`) and ```AWS_REGION``` (see [CLI docs](/docs/CLI.md)), then, from your project root:

```bash
$ dawson deploy
```
*Since dawson, by default, deploys a CloudFront Distribution, the first deployment will take approximately 20 minutes.*

After invoking your functions, you can inspect the execution logs using `$ dawson log -f index`.
You must allow a couple of minutes after the first execution, to allow the Log Group to be created.

### 3. Enjoy!
![indexFunction](http://i.imgur.com/fJd3rHC.png)

Now, learn more from `$ dawson --help` and the [Documentation](./README.md).
