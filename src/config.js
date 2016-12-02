
// this will compile on-the-fly the `api.js` required below
// by `require(PROJECT_ROOT + '/api');`
require('babel-register');

import { inspect } from 'util';
import { stripIndent } from 'common-tags';
import execa from 'execa';

import createError from './libs/error';
export const PROJECT_ROOT = process.env.PWD;

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
    `The value of the 'route53' property in your package.json is invalid.`,
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
  const cloudfrontIsValid = validateCloudFrontConfig(dawson.cloudfront);
  if (cloudfrontIsValid !== true) { return cloudfrontIsValid; }

  const route53IsValid = validateRoute53Config(dawson.route53);
  if (route53IsValid !== true) { return route53IsValid; }

  return true;
}

function validateSystem () {
  const zipResult = execa.sync('zip', ['--help']);
  if (zipResult.status !== 0) {
    return [
      `zip is a required dependency but the zip binary was not found: ${zipResult.error.message}`,
      `install the 'zip' command using operating system's package manager`
    ];
  }

  const babelResult = execa.sync('babel', ['--version']);
  const babelVersion = babelResult.stdout;
  if (babelResult.status !== 0) {
    return [
      `babel-cli is a required dependency but the babel binary v6.x.x was not found: ${babelResult.error.message}`,
      `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }
  if (!babelVersion || !babelVersion.toString().match(/^6\./)) {
    return [
      `babel-cli is a required dependency but the babel binary v6.x was not found: ${babelResult.error.message}`,
      `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }
  const yarnResult = execa.sync('yarn', ['help']);
  if (yarnResult.status !== 0) {
    return [
      `yarn is a required dependency but the yarn binary was not found: ${yarnResult.error.message}`,
      `install the yarn package manager using '$ npm install -g yarn'`
    ];
  }
  return true;
}

function validatePackageJSON (source) {
  if (!source.name) {
    return [
      'You have not specified a `name` field in your package.json.',
      `Please check the documentation: https://github.com/dawson-org/dawson-cli/wiki/`
    ];
  }
  if (!source.dependencies || !Object.keys(source.dependencies).includes('babel-polyfill')) {
    return [
      `You are missing a required dependency: 'babel-polyfill'.`,
      stripIndent`
        Please add 'babel-polyfill' to the 'dependencies' field in package.json.
        Check the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/
      `
    ];
  }
  if (!source.devDependencies || !Object.keys(source.devDependencies).includes('babel-register')) {
    return [
      `You are missing a required devDependency: 'babel-register'.`,
      stripIndent`
        Please add 'babel-register' to the 'devDependencies' field in package.json.
        Check the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/
      `
    ];
  }
  if (!source.devDependencies || !Object.keys(source.devDependencies).includes('babel-cli')) {
    return [
      `You are missing a required devDependency: 'babel-cli'.`,
      stripIndent`
        Please add 'babel-cli' to the 'devDependencies' field in package.json.
        Check the documentation for more info: https://github.com/dawson-org/dawson-cli/wiki/
      `
    ];
  }
  return validateDawsonConfig(source.dawson);
}

if (process.env.NODE_ENV !== 'testing') {
  try {
    requiredPkgJson = require(PROJECT_ROOT + '/package.json');
  } catch (e) {
    console.error(createError({
      kind: 'Cannot find package.json',
      reason: 'There is no package.json file in the current directory',
      detailedReason: stripIndent`
          You are running this command from '${process.cwd()}' which does not
          contain a package.json file as required by dawson.
        `,
      solution: stripIndent`
        * check if the file exists by running 'stat ${process.cwd()}/package.json'
        * run dawson from the correct folder
        * check file permissions on package.json
        `
    }).toFormattedString());
    process.exit(1);
  }

  try {
    requiredApi = require(PROJECT_ROOT + '/api');
  } catch (e) {
    if (e._babel) {
      console.error(createError({
        kind: 'Babel parse error',
        reason: 'Your code contains an error and could not be parsed by babel',
        detailedReason: e.message + '\n' + e.codeFrame,
        solution: stripIndent`
        * check your babel configuration, you may need a syntax plugin if you are
          using an experimental syntax
        * check the syntax of the api.js file by running it with 'babel-node'
        `
      }).toFormattedString());
      process.exit(1);
    }
    if (e.message.match(/cannot find module/i)) {
      console.error(createError({
        kind: 'Cannot find api.js',
        reason: 'There is no api.js file in the current directory',
        detailedReason: stripIndent`
          You are running this command from '${process.cwd()}' which does not
          contain an api.js file as required by dawson.
        `,
        solution: stripIndent`
        * check if the file exists by running 'stat ${process.cwd()}/api.js'
        * run dawson from the correct folder
        * check file permissions on api.js
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
        * check your babel configuration, if you are using export, import, async, await
          you may need to include the es2015 and es2017 presets or the appropriate
          transform plugin
        * check the syntax of the api.js file by running it with 'node'
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

  const pkgJsonValidationResult = validatePackageJSON(requiredPkgJson);
  if (pkgJsonValidationResult !== true) {
    console.error(createError({
      kind: `dawson configuration error`,
      reason: '' + pkgJsonValidationResult[0],
      solution: '' + pkgJsonValidationResult[1]
    }).toFormattedString());
    process.exit(1);
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
} else {
  requiredPkgJson = { dawson: {} };
  requiredApi = {};
}

export const PKG_JSON = requiredPkgJson;
export const APP_NAME = PKG_JSON.name;
export const SETTINGS = PKG_JSON.dawson || {};
export const API_DEFINITIONS = requiredApi;

export const getCloudFrontSettings = ({ appStage }) => SETTINGS.cloudfront ? SETTINGS.cloudfront[appStage] : true;
export const getHostedZoneId = ({ appStage }) => SETTINGS.route53 ? SETTINGS.route53[appStage] : null;
