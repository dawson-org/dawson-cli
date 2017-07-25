import execa from 'execa';
import { oneLine } from 'common-tags';

import path from 'path';

// == install dependencies ==
// - we ensure having the requirements.txt file, otherwise the command will fail
//

export default function ({ rootDir }) {
  const distPath = path.resolve(rootDir, '.dawson-dist');
  return execa.shell(
    oneLine`
    cd .dawson-dist &&
    touch requirements.txt &&
    pip install --upgrade -r requirements.txt -t ${distPath} &&
    chmod -Rv a+rwX ${distPath}
  `
  );
}
