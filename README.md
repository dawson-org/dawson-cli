
# dawson
A serverless web framework for nodejs on AWS (CloudFormation, API Gateway, Lambda).  

[![npm version](https://img.shields.io/npm/v/dawson.svg?maxAge=3600)]() 
[![Build Status](https://travis-ci.org/dawson-org/dawson-cli.svg?branch=master)](https://travis-ci.org/dawson-org/dawson-cli) 
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/b8a879928f4b4ad09a2d4aa7ea30a680)](https://www.codacy.com/app/simone_3096/dawson?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=lusentis/dawson&amp;utm_campaign=Badge_Grade) 
[![npm dependencies](https://david-dm.org/dawson-org/dawson-cli.svg?maxAge=3600)]() 
[![npm license](https://img.shields.io/npm/l/dawson.svg?maxAge=2592000?style=plastic)]() 
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=plastic)](https://github.com/Flet/semistandard) 

[![](https://nodei.co/npm/dawson.png?compact=true)]()


## Documentation
Guide, API & CLI Documentation is [here](docs/README.md).


## About
`dawson` let's you to deploy your Node.js apps on Amazon Web Services. It requires no boilerplate: no `init` command, no configuration files. Just write your function and `deploy`!

`dawson` does not bundle your app with webpack / browserify or rollup, so you'll never have to deal [with](https://github.com/aws/aws-sdk-js/issues/603) [weird](https://github.com/substack/brfs) [things](https://stackoverflow.com/questions/32253362/how-do-i-build-a-single-js-file-for-aws-lambda-nodejs-runtime). Your app's `devDependencies` are stripped out while deploying.

You can write your function in ES2016, ES2017, using async-await or experimental features, like you whish. Just include a `.babelrc` and dawson will compile your funcion before deploying it. Your Lambda functions can be `async` and return Promises. There's also built-in authentication support via API Gateway Custom Authorizers.

Each function has its own IAM Role, so you can define fine-graned IAM Policies, following the best practie [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).

By default, `dawson` will deploy a CloudFront Distribution in front of your app, correctly mapping assets and API origins, so if you are deploying a Single Page App you don't have to worry about CORS.

Internally, dawson uses pure CloudFormation templates, following the [infrastructure-as-code](https://en.wikipedia.org/wiki/Infrastructure_as_Code) principle and it does not use local or remote state files (like `terraform` does) which may go out-of-sync or which might get mistakenly deleted. You can customize every part of your template, e.g.: you can add CF Resources, modifify Properties of Resources created by `dawson` etc.

You get, for free, support for multiple Stages and Regions. If you use Route53 to manage your domain, `dawson` will automatically update your zone.


#### CLI
Using the `dawson` command you can deploy your functions, inspect logs (in real time, like `tail -f`) and spin up a development server which will simulate CloudFront and API Gateway, so your development environment will be almost identical to the production one.


## Demo
TODO


## Related
* https://serverless.com/
* https://github.com/apex/apex
* https://www.terraform.io/
* https://github.com/awslabs/chalice
* https://github.com/Miserlou/Zappa


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
