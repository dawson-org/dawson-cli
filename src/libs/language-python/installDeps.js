import execa from 'execa';
import { oneLine } from 'common-tags';

// == install dependencies ==
// - we ensure having the requirements.txt file, otherwise the command will fail
//

export default function () {
  return execa.shell(
    oneLine`
    cd .dawson-dist &&
    touch requirements.txt &&
    pip install -r requirements.txt
  `
  );
}
