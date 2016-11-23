
// this will compile on-the-fly the `api.js` required below
// by `require(PROJECT_ROOT + '/api');`
require('babel-register');

import { stripIndent } from 'common-tags';

import { error } from './logger';
export const PROJECT_ROOT = process.env.PWD;

let requiredPkgJson;
let requiredApi;

function validateCloudFrontConfig (cloudfront) {
  const message = stripIndent`
    The value of the 'cloudfront' property in your package.json is invalid.
    Please check the documentation: https://github.com/lusentis/dawson/blob/master/docs/API.md#packagejson-fields-reference
  `;
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
  const message = stripIndent`
    The value of the 'route53' property in your package.json is invalid.
    Please check the documentation: https://github.com/lusentis/dawson/blob/master/docs/API.md#packagejson-fields-reference
  `;
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

function validatePackageJSON (source) {
  if (!source.name) {
    error('You must specify a `name` field in your package.json.');
    process.exit(1);
  }
  const dawsonConfigIsOK = validateDawsonConfig(source.dawson);
  if (dawsonConfigIsOK !== true) {
    error(dawsonConfigIsOK);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'testing') {
  try {
    requiredPkgJson = require(PROJECT_ROOT + '/package.json');
  } catch (e) {
    error('Error: cannot find a valid package.json in current directory');
    process.exit(1);
  }

  try {
    requiredApi = require(PROJECT_ROOT + '/api');
  } catch (e) {
    error('Error: cannot find a valid api.js in current directory');
    throw e;
  }

  validatePackageJSON(requiredPkgJson);
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
