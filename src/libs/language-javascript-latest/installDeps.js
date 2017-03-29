import execa from 'execa';
import { oneLine } from 'common-tags';
import { BABEL_CONFIG } from '../../config';

export default function install ({ skipChmod }) {
  return execa.shell(
    oneLine`
      cd .dawson-dist &&
      NODE_ENV=production npm install --production babel-cli babel-polyfill
      babel-preset-env babel-plugin-transform-object-rest-spread
      ${('presets' in BABEL_CONFIG) && Array.isArray(BABEL_CONFIG.presets) ? BABEL_CONFIG.presets.map(p => 'babel-preset-' + (Array.isArray(p) ? p[0] : p)).join(' ') : null}
      ${('plugins' in BABEL_CONFIG) && Array.isArray(BABEL_CONFIG.plugins) ? BABEL_CONFIG.plugins.map(p => 'babel-plugin-' + (Array.isArray(p) ? p[0] : p)).join(' ') : null} &&
      NODE_ENV=production npm install --production
      ${skipChmod ? '' : '&& chmod -Rf a+rX .'}`
  );
}
