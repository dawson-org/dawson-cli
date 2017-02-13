
// this will compile on-the-fly the `api.js` required below
// by `require(PROJECT_ROOT + '/api');`

export const BABEL_CONFIG = {
  // also used in libs/createBundle.js
  presets: ['dawson'],
  babelrc: false
};

require('babel-register')(BABEL_CONFIG);

import AWS from 'aws-sdk';
import execa from 'execa';
import Type from 'prop-types';
import { inspect } from 'util';
import { existsSync } from 'fs';
import { stripIndent } from 'common-tags';

import createError from './libs/error';

export const AWS_REGION = AWS.config.region;
export const RESERVED_FUCTION_NAMES = ['customTemplateFragment', 'processCFTemplate'];

const FUNCTION_CONFIGURATION_PROPERTIES = [
  'path',
  'authorizer',
  'method',
  'policyStatements',
  'redirects',
  'responseContentType',
  'excludeEnv'
];

const APP_CONFIGURATION_PROPERTIES = [
  'pre-deploy',
  'post-deploy',
  'ignore',
  'cloudfront',
  'route53',
  'cloudfrontRootOrigin'
];

const FUNCTION_CONFIGURATION_SCHEMA = {
  api: Type.shape({
    path: function (props, propName) {
      const val = props[propName];
      if (val === false) {
        return;
      }
      if (typeof val !== 'string') {
        return new Error(`path must be a string or 'false'`);
      }
      if (val !== val.trim()) {
        return new Error(`path must not start or end with a space`);
      }
      if (val === '') {
        return;
      }
      if (!/^[a-zA-Z0-9/{}]+$/.test(val)) {
        // we use paths to determine API Gateway's Resource names,
        // which must match /[a-zA-Z0-9]+/. We may eventually
        // change the way we determine resource names (e.g. stripping
        // non matching chars).
        return new Error(`path should match regexp [a-zA-Z0-9/{}]+`);
      }
      if (val[0] === '/' || val[val.length - 1] === '/') {
        return new Error(`path should not begin or end with a '/'`);
      }
      if (!val.split(/\//g).every(token => /^{[^?#]+}$/.test(token) || /^[^?#{}]+$/.test(token))) {
        return new Error(`path part eiter must start and end with a curly brace or must not contain any curly brace, and it cannot contain two consecutive slashes`);
      }
    },
    authorizer: Type.func,
    method: Type.oneOf(['GET', 'POST', 'PUT', 'HEAD', 'DELETE', 'OPTIONS']),
    policyStatements: Type.arrayOf(Type.shape({
      Effect: Type.string.isRequired,
      Action: Type.oneOfType([
        Type.string,
        Type.arrayOf(Type.string)
      ]).isRequired,
      Resource: Type.oneOfType([
        Type.string,
        Type.array,
        Type.object
      ]).isRequired
    })),
    redirects: Type.bool,
    responseContentType: function (props, propName) {
      if (typeof props[propName] === 'undefined') {
        return;
      }
      if (!/^\w+\/(\w|-|\.)+$/.test(props[propName])) {
        return new Error(`responseContentType should match regexp '\\w+/\\w+'`);
      }
    },
    excludeEnv: Type.arrayOf(Type.string)
  })
};

let requiredPkgJson;
let requiredApi;

function validateCloudFrontConfig (cloudfront) {
  const message = [
    `The value of the 'cloudfront' property in your package.json is invalid.`,
    `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
  ];
  if (typeof cloudfront === 'undefined') { return true; }
  if (typeof cloudfront !== 'object') {
    return message;
  }
  const valuesAreOK = Object.values(cloudfront).every(val => {
    return typeof val === 'string' || typeof val === 'boolean';
  });
  if (!valuesAreOK) {
    return message;
  }
  return true;
}

function validateRoute53Config (route53) {
  const message = [
    `The value of the 'route53' property in your package.json is invalid (expected object<string>).`,
    `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
  ];
  if (typeof route53 === 'undefined') { return true; }
  if (typeof route53 !== 'object') {
    return message;
  }
  const valuesAreOK = Object.values(route53).every(val => typeof val === 'string');
  if (!valuesAreOK) {
    return message;
  }
  return true;
}

function validateDawsonConfig (dawson) {
  let currentPropertyName;
  if (!Object.keys(dawson).every(key => {
    currentPropertyName = key;
    return APP_CONFIGURATION_PROPERTIES.includes(key);
  })) {
    return [
      `Encountered an unknown property 'dawson.${currentPropertyName}' in package.json`,
      `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }

  const cloudfrontIsValid = validateCloudFrontConfig(dawson.cloudfront);
  if (cloudfrontIsValid !== true) { return cloudfrontIsValid; }

  const route53IsValid = validateRoute53Config(dawson.route53);
  if (route53IsValid !== true) { return route53IsValid; }

  return true;
}

function execIfExists (...args) {
  try {
    return execa.sync(...args);
  } catch (e) {
    return { status: -127 };
  }
}

function validateSystem () {
  const zipResult = execIfExists('zip', ['--help']);
  if (zipResult.status !== 0) {
    return [
      `zip is a required dependency but the zip binary was not found: ${zipResult.error.message}`,
      `install the 'zip' command using operating system's package manager`
    ];
  }
  const yarnResult = execIfExists('yarn', ['help']);
  if (yarnResult.status !== 0) {
    return [
      `yarn is a required dependency but the yarn binary was not found: ${yarnResult.error.message}`,
      `install the yarn package manager using '$ npm install -g yarn'`
    ];
  }
  return true;
}

export function validateDocker () {
  const dockerResult = execIfExists('docker', ['--help']);
  if (dockerResult.status !== 0) {
    throw new Error(stripIndent`
      docker is a required dependency but the docker binary was not found: ${dockerResult.error.message}.
      See https://docker.io for installation instructions
    `);
  }
}

function validatePackageJSON (source) {
  if (!source.name) {
    return [
      'You have not specified a `name` field in your package.json.',
      `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }
  return validateDawsonConfig(source.dawson);
}

function validateBabelRc (rootDir) {
  const error = [
    `You cannot configure babel with a .babelrc, please use the "babel" property in your package.json`,
    stripIndent`
      Just move the contents of the .babelrc file into your package.json.

      If you want to skip this check and you're absolutely sure to have configured babel
      correctly, you can run this command with --skip-babelrc-validation
      Fore more info see https://babeljs.io/docs/usage/babelrc/#use-via-package-json
    `
  ];
  if (existsSync(rootDir + '/.babelrc')) {
    return error;
  }
  return true;
}

function validateAPI (source) {
  const apiDefinitions = Object.values(source)
    .filter(f => !RESERVED_FUCTION_NAMES.includes(f.name));

  if (source.customTemplateFragment && typeof source.customTemplateFragment !== 'function') {
    return [
      `if 'customTemplateFragment' is defined, it must be a 'function', not '${typeof source.customTemplateFragment}'`,
      `Refer to the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }

  let current;
  try {
    apiDefinitions.forEach(runner => {
      current = runner.name;
      if (!runner.name) {
        throw new Error(`function should have a name`);
      }
      if (typeof runner.api !== 'object') {
        throw new Error(`missing api configuration`);
      }
      let currentPropertyName;
      if (!Object.keys(runner.api).every(configKey => {
        currentPropertyName = configKey;
        return FUNCTION_CONFIGURATION_PROPERTIES.includes(configKey);
      })) {
        throw new Error(`encountered unkown property: 'api.${currentPropertyName}'`);
      }
      Type.validateWithErrors(FUNCTION_CONFIGURATION_SCHEMA, runner);
    });
  } catch (e) {
    return [
      `Invalid function configuration for ${current}: ${e.message}`,
      `Check the api property of this function. Refer to the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }

  try {
    apiDefinitions.forEach(runner => {
      if (runner.api.authorizer != null) {
        const authorizerName = runner.api.authorizer.name;
        if (typeof source[authorizerName] !== 'function') {
          return [
            `Authorizer '${authorizerName}' should be exported from api.js`,
            `Check the api property of this function. Refer to the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/`
          ];
        }
        if (source[authorizerName].api.path !== false) {
          return [
            `Authorizer '${authorizerName}' should have api.path === false`,
            `Check the api property of this function. Refer to the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/`
          ];
        }
      }
    });
  } catch (e) {
    return [
      `Invalid function configuration for ${current}: ${e.message}`,
      `Check the api property of this function. Refer to the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }

  return true;
}

let skipValidateBabelRc = false;
export function initConfig (argv) {
  if (argv['skip-babelrc-validation'] === true) {
    skipValidateBabelRc = argv['skip-babelrc-validation'];
  }
}

export default function loadConfig (rootDir = process.cwd()) {
  try {
    requiredPkgJson = require(rootDir + '/package.json');
  } catch (e) {
    console.error(createError({
      kind: 'Cannot find package.json',
      reason: 'There is no package.json file in the current directory',
      detailedReason: stripIndent`
          You are running this command from '${rootDir}' which does not
          contain a package.json file as required by dawson.
        `,
      solution: stripIndent`
        * check if the file exists by running 'stat ${rootDir}/package.json'
        * run dawson from the correct folder
        * check file permissions on package.json
        `
    }).toFormattedString());
    process.exit(1);
  }

  if (!requiredPkgJson.name) {
    console.error(createError({
      kind: 'Missing app name',
      reason: `The package.json should contain a 'name' field`,
      solution: stripIndent`
        * add a non-empty 'name' field to your package.json.
        `
    }).toFormattedString());
    process.exit(1);
  }

  try {
    requiredApi = require(rootDir + '/api');
  } catch (e) {
    if (e._babel) {
      console.error(createError({
        kind: 'Babel parse error',
        reason: 'Your code contains an error and could not be parsed by babel',
        detailedReason: e.message + '\n' + e.codeFrame,
        solution: stripIndent`
        * check your babel configuration, you may need a syntax plugin if you are
          using an experimental syntax
        * check the syntax of the api.js file by running it with 'babel-node --presets babel-preset-dawson'
        `
      }).toFormattedString());
      process.exit(1);
    }
    if (e.message.match(/cannot find module.*\/api'$/i)) {
      console.error(createError({
        kind: 'Cannot find api.js',
        reason: 'There is no api.js file in the current directory',
        detailedReason: stripIndent`
          You are running this command from '${rootDir}' which does not
          contain an api.js file as required by dawson.
        `,
        solution: stripIndent`
        * check if the file exists by running 'stat ${rootDir}/api.js'
        * run dawson from the correct folder
        * check file permissions on api.js
        `
      }).toFormattedString());
      process.exit(1);
    }
    if (e.message.match(/Couldn't find preset "(.*?)" relative to/i)) {
      console.error(createError({
        kind: 'Missing babel dependencies',
        reason: 'Some babel presets or plugins could not be loaded',
        detailedReason: stripIndent`
          Please install babel-preset-dawson.
          Babel's error message is: '${e.message}'
        `,
        solution: stripIndent`
        $ npm install --save-dev babel-preset-dawson
        $ yarn add --dev babel-preset-dawson
        `
      }).toFormattedString());
      process.exit(1);
    }
    if (e instanceof SyntaxError) {
      console.error(createError({
        kind: 'Node.js error: SyntaxError',
        reason: 'Your code contains a SyntaxError and could not be executed by node',
        detailedReason: 'Your file has been transpiled with babel but node is not able to execute it\n\n' + inspect(e),
        solution: stripIndent`
        * check your babel configuration, if you are using non-'latest' features
          you may need to include the appropriate transform plugin
        * check the babel documentation: https://babeljs.io/docs/plugins/
        * check the syntax of the api.js file by running it with 'babel-node'
        `
      }).toFormattedString());
      process.exit(1);
    }
    // RangeError, ReferenceError, TypeError
    console.error(createError({
      kind: `Node.js error: ${e.name}`,
      reason: `Your code thrown a ${e.name} and could not be executed by node`,
      detailedReason: '' + inspect(e),
      solution: stripIndent`
        * you are accessing an undeclared variable, try to lint your code
        * you are running code at top-level in your api.js or in any file that it requires
          and such code thrown a ${e.name}. Move that code into a function
        `
    }).toFormattedString());
    process.exit(1);
  }

  const apiValidationResult = validateAPI(requiredApi);
  if (apiValidationResult !== true) {
    console.error(createError({
      kind: `dawson configuration error`,
      reason: '' + apiValidationResult[0],
      solution: '' + apiValidationResult[1]
    }).toFormattedString());
    process.exit(1);
  }

  const pkgJsonValidationResult = validatePackageJSON(requiredPkgJson);
  if (pkgJsonValidationResult !== true) {
    console.error(createError({
      kind: `dawson configuration error`,
      reason: '' + pkgJsonValidationResult[0],
      solution: '' + pkgJsonValidationResult[1]
    }).toFormattedString());
    process.exit(1);
  }

  if (!skipValidateBabelRc) {
    const babelValidationResult = validateBabelRc(rootDir);
    if (babelValidationResult !== true) {
      console.error(createError({
        kind: `babel configuration error`,
        reason: '' + babelValidationResult[0],
        solution: '' + babelValidationResult[1]
      }).toFormattedString());
      process.exit(1);
    }
  }

  const systemValidationResult = validateSystem();
  if (systemValidationResult !== true) {
    console.error(createError({
      kind: `system prerequisite failed`,
      reason: '' + systemValidationResult[0],
      solution: '' + systemValidationResult[1]
    }).toFormattedString());
    process.exit(1);
  }

  const appName = requiredPkgJson.name;
  const settings = requiredPkgJson.dawson || {};

  const getCloudFrontSettings = ({ appStage }) => {
    if (!settings.cloudfront) {
      return true;
    }
    if (typeof settings.cloudfront[appStage] === 'undefined') {
      return true;
    }
    return settings.cloudfront[appStage];
  };

  return {
    API_DEFINITIONS: requiredApi,
    APP_NAME: appName,
    PKG_JSON: requiredPkgJson,
    PROJECT_ROOT: rootDir,
    SETTINGS: settings,
    getCloudFrontSettings,
    getHostedZoneId: ({ appStage }) => settings.route53 ? settings.route53[appStage] : null
  };
}
