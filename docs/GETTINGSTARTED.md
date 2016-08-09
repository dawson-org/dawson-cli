
## Usage

### 0. Install

```
$ git clone https://github.com/lusentis/dawson
$ cd dawson
$ npm install
$ npm link
```

I'll publish an updated npm package as soon as I complete a code review and the whole documentation.


### 1. Code

Set your App's name and domain in the `package.json` (change to something *unique*):
```json
"dawson": {
  "appName": "myExample123",
  "domains": ["my-domain-name-for-cloudfront-xxx.com"]
}
```


By default, **dawson** expects an ```api.js``` file which exports the functions to deploy. Each function *must* have an ```api``` property with at least a ```path```. That's it!

```javascript
// the path "/hello" will display the string "You are awesome"
export function index(params) {
  // you can return promises or strings.
  return '<html><body>You are awesome!</html></body>';
}
index.api = {
  path: 'hello',
};
```

Install the **required** runtime dependencies:

```
$ npm install --save babel-register babel-polyfill babel-preset-es2017
$ echo '{"presets":["es2017"]}' > .babelrc
```

### 2. Deploy

Export ```AWS_ACCESS_KEY_ID```, ```AWS_SECRET_ACCESS_KEY``` (or `AWS_DEFAULT_PROFILE`) and ```AWS_REGION```, then, from your project root:

```bash
$ dawson deploy
```

Later, after making some changes, you can deploy only this function: `$ dawson deploy --function index`.  
You can now inspect execution logs using `$ dawson log -f index` or learn more from `$ dawson --help` and the [Documentation](./README.md).

### 3. Enjoy!
![indexFunction](http://i.imgur.com/fJd3rHC.png)
