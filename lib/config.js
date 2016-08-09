
import { error, log } from './logger';
export const PROJECT_ROOT = process.env.PWD;

let requiredPkgJson;
let requiredApi;

if (process.env.NODE_ENV !== 'testing') {
  try {
    requiredPkgJson = require(PROJECT_ROOT + '/package.json');
  } catch (e) {
    error('Cannot find a valid package.json in current directory.');
    process.exit(1);
  }

  try {
    requiredApi = require(PROJECT_ROOT + '/api');
  } catch (e) {
    error('Cannot find a valid api.js in current directory.');
    log('You may have syntax errors in your api.js.');
    process.exit(1);
  }
} else {
  requiredPkgJson = { dawson: {} };
  requiredApi = {};
}

export const PKG_JSON = requiredPkgJson;
export const SETTINGS = PKG_JSON.dawson;
export const API_DEFINITIONS = requiredApi;
