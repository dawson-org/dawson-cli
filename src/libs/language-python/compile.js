import execa from 'execa';
import { oneLine } from 'common-tags';

// == compile (?) and copy all the files to .dawson-dist ==
// steps:
// - create the .dawson-dist directory (if it doesn't exist)
// - copy all the files there and compile if necessary
// - we ensure having an __init__.py file at the root
// - update file permissions (or zip without preserving file permissions - how?)
//

export default function () {
  return execa.shell(
    oneLine`
    mkdir .dawson-dist &&
    cp -rv * .dawson-dist &&
    touch .dawson-dist/__init__.py &&
    chmod -Rv a+rwX .dawson-dist
  `
  );
}
