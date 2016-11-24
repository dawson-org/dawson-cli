
# dawson
A serverless web framework for nodejs on AWS (CloudFormation, API Gateway, Lambda).  

[![npm version](https://img.shields.io/npm/v/dawson.svg?maxAge=3600)]() 
[![Build Status](https://travis-ci.org/dawson-org/dawson-cli.svg?branch=master)](https://travis-ci.org/dawson-org/dawson-cli) 
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/b8a879928f4b4ad09a2d4aa7ea30a680)](https://www.codacy.com/app/simone_3096/dawson?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=lusentis/dawson&amp;utm_campaign=Badge_Grade) 
[![npm dependencies](https://david-dm.org/dawson-org/dawson-cli.svg?maxAge=3600)]() 
[![npm license](https://img.shields.io/npm/l/dawson.svg?maxAge=2592000?style=plastic)]() 
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=plastic)](https://github.com/Flet/semistandard) 

[![](https://nodei.co/npm/dawson.png?compact=true)]()

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
* [X] support multiple stages/regions per app
* [ ] built-in authentication support via API Gateway Authorizers & Cognito Identity Provider

### CLI
* [X] tail logs
* [X] upload static assets
* [X] locally run lambda functions

## Documentation
Guide, API & CLI Documentation is [here](docs/README.md).

## Demo
[![asciicast](https://asciinema.org/a/cq1t6rhfo0g19ovafabcsawlz.png?v=2)](https://asciinema.org/a/cq1t6rhfo0g19ovafabcsawlz)
*Please note that this example uses the `cloudfront: false` setting, which tells `dawson` to skip deploying the CloudFront distribution (which would be useful in a production environment). If a CloudFront distribution needs to be created, the deploy will take approximately 12-18 minutes to complete. More info [here](docs/API.md#packagejson-fields-reference).*


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
