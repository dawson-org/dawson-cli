import execa from 'execa';
import { oneLine } from 'common-tags';

export default function install ({ skipChmod }) {
  return execa.shell(
    oneLine`
      cd .dawson-dist &&
      NODE_ENV=production npm install --production babel-cli babel-polyfill babel-preset-env
               babel-plugin-transform-object-rest-spread &&
      NODE_ENV=production npm install --production
      ${skipChmod ? '' : '&& chmod -Rf a+rX .'}`
  );
}
