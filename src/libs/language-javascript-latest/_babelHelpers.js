
//
// Transpiling with babel is needed because describeApi will directly
// call `require(PROJECT_ROOT + '/api');
//

import path from 'path';
import { stripIndent } from 'common-tags';
import { debug, warning } from '../../logger';

// Support for `babel` property in project package.json to extend base babel config
// to add plugins and more presets, etc. React, JSX Transform, Syntax support
const babelRequiredPkgJson = require(path.join(process.cwd(), 'package.json'));

// check if babel key is package.json
const hasBabelConfigInPkgJson = ('babel' in babelRequiredPkgJson);

if (hasBabelConfigInPkgJson) {
  warning(stripIndent`
    You have specified a custom babel configuration; please make sure
    that you are compiling code for the correct version of Node.js (6.10).
    Usually you may want to include 'babel-preset-dawson'.
  `);
}

// if key, use that babel config, add babelrc = false
// else, use default
export const BABEL_CONFIG = hasBabelConfigInPkgJson
  ? Object.assign({}, babelRequiredPkgJson['babel'], {
    babelrc: false
  })
  : {
    // also used in libs/createBundle.js
    presets: ['dawson'],
    babelrc: false
  };

// only preset names, without config
const getPresetsArg = () =>
  Array.isArray(BABEL_CONFIG.presets)
    ? ['--presets', BABEL_CONFIG.presets.map(p => Array.isArray(p) ? p[0] : p).join(',')]
    : [];

// only plugin names, without config
const getPluginsArg = () =>
  Array.isArray(BABEL_CONFIG.plugins)
    ? ['--plugins', BABEL_CONFIG.plugins.map(p => Array.isArray(p) ? p[0] : p).join(',')]
    : [];

export const makeBabelArgs = (ignore = []) => ([
  '.',
  '--out-dir',
  '.dawson-dist/',
  '--ignore',
  `node_modules,${ignore.join(',')}`,
  (BABEL_CONFIG.babelrc === false) ? '--no-babelrc' : null,
  ...getPresetsArg(),
  ...getPluginsArg(),
  '--copy-files'
].filter(Boolean));

const getPresetsPackages = () => Array.isArray(BABEL_CONFIG.presets)
  ? BABEL_CONFIG.presets.map(p => 'babel-preset-' + (Array.isArray(p) ? p[0] : p))
  : [];

const getPluginsPackages = () => Array.isArray(BABEL_CONFIG.plugins)
  ? BABEL_CONFIG.plugins.map(p => 'babel-plugin-' + (Array.isArray(p) ? p[0] : p))
  : [];

export const getBabelPackages = () => ([
  ...new Set([
    'babel-cli',
    'babel-polyfill',
    'babel-preset-env',
    'babel-plugin-transform-object-rest-spread',
    ...getPresetsPackages(),
    ...getPluginsPackages()
  ])
]);

export const registerBabel = () => {
  debug('Registering babel using config', BABEL_CONFIG);
  require('babel-register')(BABEL_CONFIG);
};
