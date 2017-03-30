
import path from 'path';
import execa from 'execa';

import { debug } from '../../logger';
import { makeBabelArgs } from './_babelHelpers';

export default function compile ({ ignore }) {
  try {
    // == attempt 1 ==
    // dawson is installed globally (yarn/npm) or locally with yarn
    // (yarn does not hoist .bin to the top)
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
