/* eslint no-unused-vars: 0 */

import test from 'ava';

import createIndex from './createIndex';

test('createIndex', t => {
  const expected = `require('babel-polyfill');

    const stackName = 'barapp';
    var stackOutputs = null;

    function dawsonDescribeOutputs() {
      if (!stackOutputs) {
        const AWS = require('aws-sdk');
        const cloudformation = new AWS.CloudFormation({});
        const params = {
          StackName: stackName,
        };
        return cloudformation.describeStacks(params).promise()
        .then(result => {
          const outputs = result.Stacks[0].Outputs;
          const ret = {};
          outputs.forEach(output => {
            ret[output.OutputKey] = output.OutputValue;
          });
          stackOutputs = ret;
          return ret;
        })
        .catch(err => {
          console.error(\`Error describing stack barapp\`, err.message, err.stack);
          throw err;
        });
      } else {
        return Promise.resolve(stackOutputs);
      }
    }

    module.exports.helloWorld = function (event, context, callback) {
      if (event.__ping) {
        return callback(null, '"pong__"');
      }
      context.dawsonDescribeOutputs = dawsonDescribeOutputs;
      const runner = require('./api').helloWorld;
      Promise.resolve()
      .then(function () {
        return runner(event, context);
      })
      .then(function (data) {
        if (event.meta && event.meta.expectedResponseContentType.indexOf('application/json') !== -1) {
  return callback(null, { response: JSON.stringify(data) });
}
callback(null, { response: data });
      })
      .catch(function (err) {
        try {
          // Promise rejections should be Errors containing a JSON-stringified 'message property'
          // which contains the error information to be displayed.
          // If the property is not valid JSON, the error is not exposed to the client
          // and a generic HTTP 500 error will be exposed
          JSON.parse(err.message);
          console.error('Lambda will terminate with error', err.message);
          return callback(err.message);
        } catch (_jsonError) {
          console.error('Unhandled error will be swallowed and reported as HTTP 500:');
          console.error(err);
          console.error('Stack Trace:', err.message, err.stack);
          const opaqueError = {
            unhandled: true,
            message: 'Unhandled internal error',
            httpStatus: 500
          };
          return callback(JSON.stringify(opaqueError));
        }
      });
    };

module.exports.myEventHandler = function (event, context, callback) {
      if (event.__ping) {
        return callback(null, '"pong__"');
      }
      context.dawsonDescribeOutputs = dawsonDescribeOutputs;
      const runner = require('./api').myEventHandler;
      Promise.resolve()
      .then(function () {
        return runner(event, context);
      })
      .then(function (data) {
        // this function has not been called via API Gateway, we return the value as-is
return callback(null, data);
      })
      .catch(function (err) {
        try {
          // Promise rejections should be Errors containing a JSON-stringified 'message property'
          // which contains the error information to be displayed.
          // If the property is not valid JSON, the error is not exposed to the client
          // and a generic HTTP 500 error will be exposed
          JSON.parse(err.message);
          console.error('Lambda will terminate with error', err.message);
          return callback(err.message);
        } catch (_jsonError) {
          console.error('Unhandled error will be swallowed and reported as HTTP 500:');
          console.error(err);
          console.error('Stack Trace:', err.message, err.stack);
          const opaqueError = {
            unhandled: true,
            message: 'Unhandled internal error',
            httpStatus: 500
          };
          return callback(JSON.stringify(opaqueError));
        }
      });
    };`;
  const config = { helloWorld: {}, myEventHandler: {}, processCFTemplate: {} };
  config.helloWorld.api = {
    path: 'hello',
    responseContentType: 'application/json'
  };
  config.myEventHandler.api = { path: false };
  const actual = createIndex(config, 'barapp');
  t.deepEqual(expected, actual);
});
