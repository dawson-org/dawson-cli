import { stripIndent } from 'common-tags';
import prettier from 'prettier';

function getRunnerCode (name, apiConfig) {
  if (apiConfig.devInstrument !== true ||
      process.env.DAWSON_DEV_PROXY === 'yes') {
    // if we are running from the development server, just execute normally...
    return 'return runner(event, context);';
  }

  // when devInstrument is true, we send every incoming event
  // to an SQS Queue, so that the development server can receive
  // the event and execute the corresponding function
  const logicalLambdaName = `${name[0].toUpperCase()}${name.slice(1)}`;
  return stripIndent`
    return new Promise((resolve, reject) => {
      const AWS = require('aws-sdk');
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
      const queueRequestUrl = process.env.DAWSONInstrument_Queue_${logicalLambdaName};
      const queueResponseUrl = process.env.DAWSONInstrument_Queue_Response_${logicalLambdaName};
      console.log('devInstrument: will handle this event', {
        queueRequestUrl,
        queueResponseUrl,
        event: JSON.stringify(event, null, 2)
      });
      const message = JSON.stringify(event);
      sqs.sendMessage({
        QueueUrl: queueRequestUrl,
        MessageBody: message
      })
      .promise()
      .then(data => {
        console.log('devInstrument: message publish OK', data.MessageId);
        // NOTICE:
        // max queue polling time will be limited to 30s due to API Gateway
        // timeout value. WaitTimeSeconds is 20s due to an SQS Limit;
        // the latter actually limit max processing time to 20s since we call
        // receiveMessage
        return sqs
          .receiveMessage({
            QueueUrl: queueResponseUrl,
            WaitTimeSeconds: 20,
            VisibilityTimeout: 30
          })
          .promise()
          .then(data => {
            console.log('devInstrument: response queue has received a message', JSON.stringify(data));
            if (!data.Messages || data.Messages.length === 0) {
              return reject(new Error(JSON.stringify({
                unhandled: false,
                message: 'Did not receive a response from the development server within 20 seconds.',
                httpStatus: 504
              })));
            }
            console.log('devInstrument: continuing with first message in queue...');
            const responseMessage = data.Messages[0];
            const responseBody = JSON.parse(responseMessage.Body);
            const responseReceiptHandle = responseMessage.ReceiptHandle;
            let realResponse;
            if (event.meta && event.meta.expectedResponseContentType.indexOf('application/json') !== -1) {
              // unwrap "response" added by docker-lambda runner and parse
              // json encoded by the docker-lambda runner
              realResponse = JSON.parse(responseBody.response);
            } else {
              // unwrap "response" added by the docker-lambda runner
              realResponse = responseBody.response;
            }
            console.log('devInstrument: got response', JSON.stringify(realResponse));
            resolve(realResponse);
            console.log('devInstrument: deleting response message');
            return sqs
              .deleteMessage({
                QueueUrl: queueResponseUrl,
                ReceiptHandle: responseReceiptHandle
              })
              .promise()
              .then(() => {
                console.log('devInstrument: all done');
              })
          })
          .catch(e => {
            console.log('devInstrument: error', e.message);
            return callback(e);
          });
      });
    });
  `;
}

function getWrappingCode (apis, name) {
  const apiConfig = apis[name].api;
  if (!apiConfig) {
    // this is not a function to be uploaded
    // (e.g.: processCFTemplate, customTemplateFragment, ...)
    return;
  }
  const hasEndpoint = apiConfig.path !== false;
  const body = stripIndent`
    module.exports.${name} = function (event, context, callback) {
      if (event.__ping) {
        // __ping events are used by the keep-alive logic (to prevent Lambda's cooling)
        return callback(null, '"pong__"');
      }

      // require the main api.js file and get this function's handler
      const runner = require('./api').${name};
      Promise.resolve()
      .then(function () {
        ${getRunnerCode(name, apiConfig)}
      })
      .then(function (data) {
        ${hasEndpoint
    ? stripIndent`
            // prepare response for api-gateway and auto stringify JSON if responseContentType is application/json
            if (event.meta && event.meta.expectedResponseContentType.indexOf('application/json') !== -1) {
              return callback(null, { response: JSON.stringify(data) });
            }
            callback(null, { response: data });
          `
    : stripIndent`
            // else, if this function has no "path" configured, we return the value as-is
            return callback(null, data);
          `}
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
  `;
  return body;
}

export default function createIndex (apis, stackName) {
  const exportedFunctions = Object
    .keys(apis)
    .map(name => getWrappingCode(apis, name));
  let code = stripIndent`
    require('babel-polyfill');

    const stackName = '${stackName}';

    ${exportedFunctions.join('\n\n')}
  `;

  code = prettier.format(code, {
    printWidth: 80,
    singleQuote: true,
    bracketSpacing: true
  });
  return code;
}
