import execa from 'execa';
import { oneLine } from 'common-tags';

import path from 'path';
import assert from 'assert';

import { debug } from '../../logger';

// == wrapper code for the python parser ==
// call the require.py script and return the resulting JSON
//

export default function ({ rootDir }) {
  const requirePyPath = path.resolve(__dirname, 'api-parser', 'require.py');
  const result = execa.shellSync(
    oneLine`
    python ${requirePyPath}
  `,
    { cwd: rootDir }
  );
  if (result.status !== 0) {
    throw new Error('require.py exited with non-zero code: ' + result.status);
  }
  const rawFunctionsList = result.stdout;
  try {
    const functionsList = JSON.parse(rawFunctionsList); // [{ name, api }]
    const apiDefinitions = {};
    functionsList.forEach(api => {
      assert.equal(typeof api.name, 'string');
      assert.equal(typeof api.api, 'object');
      apiDefinitions[api.name] = {
        name: api.name,
        api: api.api
      };
    });
    return apiDefinitions;
  } catch (e) {
    debug('config from python require.py', rawFunctionsList);
    throw new Error(
      'internal error: require.py returned an invalid JSON String'
    );
  }
}
