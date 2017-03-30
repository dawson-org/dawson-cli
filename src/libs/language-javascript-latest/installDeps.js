import execa from 'execa';
import { oneLine } from 'common-tags';
import { getBabelPackages } from './_babelHelpers';

export default function install ({ skipChmod }) {
  return execa.shell(
    oneLine`
      cd .dawson-dist &&
      NODE_ENV=production npm install --production
      ${getBabelPackages().join(' ')}
      &&
      NODE_ENV=production npm install --production
      ${skipChmod ? '' : '&& chmod -Rf a+rX .'}`
  );
}
