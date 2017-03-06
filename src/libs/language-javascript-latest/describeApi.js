import { inspect } from 'util';
import path from 'path';
import { stripIndent } from 'common-tags';
import createError from '../error';

export default function ({ rootDir }) {
  try {
    const requiredApi = require(rootDir + '/api');
    return requiredApi;
  } catch (e) {
    if (e._babel) {
      throw createError({
        kind: 'Babel parse error',
        reason: 'Your code contains an error and could not be parsed by babel',
        detailedReason: e.message + '\n' + e.codeFrame,
        solution: stripIndent`
        * check your babel configuration, you may need a syntax plugin if you are
          using an experimental syntax
        * check the syntax of the api.js file by running it with 'babel-node --presets babel-preset-dawson'
        `
      });
    }
    if (e.message.match(/cannot find module.*\/api'$/i)) {
      throw createError({
        kind: 'Cannot find api.js',
        reason: 'There is no api.js file in the current directory',
        detailedReason: stripIndent`
          You are running this command from '${rootDir}' which does not
          contain an api.js file as required by dawson.
        `,
        solution: stripIndent`
        * check if the file exists at ${path.join(rootDir, 'api.js')}
        * run dawson from the correct folder
        * check file permissions on api.js
        `
      });
    }
    if (e.message.match(/Couldn't find preset "(.*?)" relative to/i)) {
      throw createError({
        kind: 'Missing babel dependencies',
        reason: 'Some babel presets or plugins could not be loaded',
        detailedReason: stripIndent`
          Please install babel-preset-dawson.
          Babel's error message is: '${e.message}'
        `,
        solution: stripIndent`
        $ npm install --save-dev babel-preset-dawson
        `
      });
    }
    if (e instanceof SyntaxError) {
      throw createError({
        kind: 'Node.js error: SyntaxError',
        reason: 'Your code contains a SyntaxError and could not be executed by node',
        detailedReason: 'Your file has been transpiled with babel but node is not able to execute it\n\n' +
          inspect(e),
        solution: stripIndent`
        * check your babel configuration, if you are using non-'latest' features
          you may need to include the appropriate transform plugin
        * check the babel documentation: https://babeljs.io/docs/plugins/
        * check the syntax of the api.js file by running it with 'babel-node'
        `
      });
    }
    // RangeError, ReferenceError, TypeError
    throw createError({
      kind: `Node.js error: ${e.name}`,
      reason: `Your code thrown a ${e.name} and could not be executed by node`,
      detailedReason: '' + inspect(e),
      solution: stripIndent`
        * you are accessing an undeclared variable, try to lint your code
        * you are running code at top-level in your api.js or in any file that it requires
          and such code thrown a ${e.name}. Move that code into a function
        `
    });
  }
}
