/* eslint no-unused-vars: 0 */

import test from 'ava';

import createIndex from './createIndex';

test('createIndex', t => {
  const expected = `require('babel-polyfill');

const stackName = 'barapp';

module.exports.helloWorld = function(event, context, callback) {
  if (event.__ping) {
    // __ping events are used by the keep-alive logic (to prevent Lambda's cooling)
    return callback(null, '"pong__"');
  }

  // require the main api.js file and get this function's handler
  const runner = require('./api').helloWorld;
  Promise.resolve()
    .then(function() {
      return runner(event, context);
    })
    .then(function(data) {
      // prepare response for api-gateway and auto stringify JSON if responseContentType is application/json
      if (
        event.meta &&
        event.meta.expectedResponseContentType.indexOf('application/json') !==
          -1
      ) {
        return callback(null, { response: JSON.stringify(data) });
      }
      callback(null, { response: data });
    })
    .catch(function(err) {
      try {
        // Promise rejections should be Errors containing a JSON-stringified 'message property'
        // which contains the error information to be displayed.
        // If the property is not valid JSON, the error is not exposed to the client
        // and a generic HTTP 500 error will be exposed
        JSON.parse(err.message);
        console.error('Lambda will terminate with error', err.message);
        return callback(err.message);
      } catch (_jsonError) {
        console.error(
          'Unhandled error will be swallowed and reported as HTTP 500:'
        );
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

module.exports.myEventHandler = function(event, context, callback) {
  if (event.__ping) {
    // __ping events are used by the keep-alive logic (to prevent Lambda's cooling)
    return callback(null, '"pong__"');
  }

  // require the main api.js file and get this function's handler
  const runner = require('./api').myEventHandler;
  Promise.resolve()
    .then(function() {
      return new Promise((resolve, reject) => {
        console.log('devInstrument: will handle this event');
        const AWS = require('aws-sdk');
        const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
        const queueUrl = process.env.DAWSONInstrument_Queue_MyEventHandler;
        const message = JSON.stringify(event);
        sqs
          .sendMessage({
            QueueUrl: queueUrl,
            MessageBody: message
          })
          .promise()
          .then(data => {
            console.log('devInstrument: message publish OK', data.MessageId);
            return callback(null);
          })
          .catch(e => {
            console.log(
              'devInstrument: error publishing to Queue',
              queueUrl,
              message
            );
            return callback(e);
          });
      });
    })
    .then(function(data) {
      // else, if this function has no "path" configured, we return the value as-is
      return callback(null, data);
    })
    .catch(function(err) {
      try {
        // Promise rejections should be Errors containing a JSON-stringified 'message property'
        // which contains the error information to be displayed.
        // If the property is not valid JSON, the error is not exposed to the client
        // and a generic HTTP 500 error will be exposed
        JSON.parse(err.message);
        console.error('Lambda will terminate with error', err.message);
        return callback(err.message);
      } catch (_jsonError) {
        console.error(
          'Unhandled error will be swallowed and reported as HTTP 500:'
        );
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
`;
  const config = { helloWorld: {}, myEventHandler: {}, processCFTemplate: {} };
  config.helloWorld.api = {
    path: 'hello',
    responseContentType: 'application/json'
  };
  config.myEventHandler.api = {
    path: false,
    devInstrument: true
  };
  const actual = createIndex(config, 'barapp');
  t.deepEqual(expected, actual);
});
