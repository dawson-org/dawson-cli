
# dAWSon
An opinionated serverless web framework for nodejs on AWS (CloudFormation, API Gateway, Lambda).  

[![Build Status](https://travis-ci.org/lusentis/dawson.svg?branch=master)](https://travis-ci.org/lusentis/dawson)
![stability-experimental](https://img.shields.io/badge/stability-experimental-orange.svg)
[![npm version](https://img.shields.io/npm/v/dawson.svg?maxAge=3600)]()
[![npm license](https://img.shields.io/npm/l/dawson.svg?maxAge=2592000?style=plastic)]()
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=plastic)](https://github.com/Flet/semistandard)

## Features

* [X] zero boilerplate
* [X] 100% infrastructure-as-code via CloudFormation
* [X] stateless: no local/remote state files
* [X] full compatibility with single-page apps
* [X] babel supported out-of-the-box
* [X] optionally support promises as function handlers
* [X] node_modules bundled as-is
* [X] customizable functions' IAM Policies
* [X] optionally, CloudFront to avoid CORS
* [X] fully extensible and customizable with user-defined CloudFormation templates
* [ ] support multiple stages/regions per app
* [ ] built-in authentication support via API Gateway Authorizers & Cognito Identity Provider

### CLI
* [X] tail logs
* [X] upload static assets
* [X] locally run lambda functions

## Documentation

You may start reading and trying out the Usage section below, then check out a [full example](https://github.com/lusentis/dawson/tree/master/example/simple-1).  
API & CLI Documentation is [here](DOCS.md).


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

Set your App's name and domain in the `package.json`:
```json
  "dawson": {
    "appName": "dawsonExample",
    "domains": ["my-domain-name-for-cloudfront.com"]
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

Later, after making some changes, you can qui**k**ly deploy only this **f**unction: `$ dawson deploy -k -f index`.  
You can now inspect execution logs using `$ dawson log -f index` or learn more from `$ dawson --help` and [Documentation](DOCS.md).

### 3. Enjoy!
![indexFunction](http://i.imgur.com/fJd3rHC.png)


## Throubleshooting

Common error causes:

* syntax error in your code, try to lint or run `babel-node api.js`
* check that all your dependecies are listed in `package.json`
* make sure you have run `npm install`
* search issues


## License

    Copyright (C) 2016  Simone Lusenti
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    
    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
