
import { error } from '../logger';

export const RUNNER_FUNCTION_BODY = `
Promise.resolve()
.then(function () {
  return runner(event);
})
.then(function (data) {
  if (event.meta && event.meta.expectedResponseContentType.indexOf('text/html') !== -1) {
    callback(null, { html: data });
  } else if (event.meta && event.meta.expectedResponseContentType.indexOf('application/json') !== -1) {
    callback(null, { response: JSON.stringify(data) });
  } else if (event.meta && event.meta.expectedResponseContentType.indexOf('text/plain') !== -1) {
    callback(null, { response: data });
  } else {
    console.log('WARNING: Unexpected content type (in event.meta), forwarding result as-is (but it probably errors because we expect a response to be wrapped in a response property.');
    callback(null, data);
  }
})
.catch(function (err) {
  return callback(err);
});
`;


function prepareIndexFile (name, apiConfig) {
  if (apiConfig.noWrap === true) {
    return `
    // This is the content of index.js
    // which is require-d by lambda
    // which then executes the handler property
    // (you are using the .noWrap option)
    //
    require("babel-polyfill");
    require('babel-register');
    const runner = require('./api').${name};
    module.exports.handler = runner;
    `;
  }

  return `
  // This is the content of index.js
  // which is require-d by lambda
  // which then executes the handler property
  //
  require("babel-polyfill");
  require('babel-register');
  const runner = require('./api').${name};
  module.exports.handler = function _handlerIndexWrapper(event, context, callback) {
    ${RUNNER_FUNCTION_BODY}
  }
  `;
}

export default function compileCode (name, apiConfig) {
  try {
    const str = prepareIndexFile(name, apiConfig);
    return Promise.resolve(str);
  } catch (err) {
    error('Compiler error', err);
    return Promise.reject(err);
  }
}

