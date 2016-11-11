
// this will compile on-the-fly the `api.js` required below
// by `require(PROJECT_ROOT + '/api');`
require('babel-register')({
  presets: ['es2015', 'es2017'],
  plugins: ['syntax-object-rest-spread', 'transform-object-rest-spread', 'transform-runtime']
});

import { error } from './logger';
export const PROJECT_ROOT = process.env.PWD;

let requiredPkgJson;
let requiredApi;

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
} else {
  requiredPkgJson = { dawson: {} };
  requiredApi = {};
}

export const PKG_JSON = requiredPkgJson;
export const SETTINGS = PKG_JSON.dawson;
export const API_DEFINITIONS = requiredApi;
