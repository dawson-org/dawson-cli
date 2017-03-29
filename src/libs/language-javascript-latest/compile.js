
import path from 'path';
import execa from 'execa';

import { debug } from '../../logger';
import { BABEL_CONFIG } from '../../config';

const makeBabelArgs = (ignore = []) => ([
  '.',
  '--out-dir',
  '.dawson-dist/',
  '--ignore',
  `node_modules,${ignore.join(',')}`,
  (BABEL_CONFIG.babelrc === false) ? '--no-babelrc' : null,
  '--presets',
  BABEL_CONFIG.presets.map(p => Array.isArray(p) ? p[0] : p).join(','), // only preset names, without config
  '--plugins',
  BABEL_CONFIG.plugins.map(p => Array.isArray(p) ? p[0] : p).join(','), // only plugin names, without config
  '--copy-files'
].filter(Boolean));

export default function compile ({ ignore }) {
  try {
    // == attempt 1 ==
    // dawson is installed globally (yarn/npm) or locally with yarn
    // (yarn does not hoist .bin to the top)
    console.log(makeBabelArgs(ignore));
    const babelPath = path.join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'babel');
    debug('Babel attempt #1 with path =', babelPath);
    return execa(babelPath, makeBabelArgs(ignore));
  } catch (e) {
    if (e.message.indexOf('ENOENT') === -1) {
      throw e;
    }
    // == attempt 2 ==
    // dawson is installed locally with npm
    // (npm does hoist .bin to the top)
    const babelPath = path.join(process.cwd(), 'node_modules', '.bin', 'babel');
    debug('Babel attempt #2 with path =', babelPath);
    return execa(babelPath, makeBabelArgs(ignore));
  }
}
