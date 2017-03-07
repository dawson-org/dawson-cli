import { stripIndent } from 'common-tags';

// == create python-specific function wrapping logic (for Lambda) ==
//

function getRunnerCode (name, apiConfig) {
  if (apiConfig.devInstrument !== true ||
      process.env.DAWSON_DEV_PROXY === 'yes') {
    // if we are not running from the development server, just execute normally...
    return `${name}Runner(event, context)`;
  }

  // when devInstrument is true, we send every incoming event
  // to an SQS Queue, so that the development server can receive
  // the event and execute the corresponding function
  throw new Error(`devInstrument is not implemented for the python runtime`);
  /*
  // reference Node.js implementation:
  const logicalLambdaName = `${name[0].toUpperCase()}${name.slice(1)}`;
  return stripIndent`
    return new Promise((resolve, reject) => {
      console.log('devInstrument: will handle this event');
      const AWS = require('aws-sdk');
      const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
      const queueUrl = process.env.DAWSONInstrument_Queue_${logicalLambdaName};
      const message = JSON.stringify(event);
      sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: message
      })
      .promise()
      .then(data => {
        console.log('devInstrument: message publish OK', data.MessageId);
        return callback(null);
      })
      .catch(e => {
        console.log('devInstrument: error publishing to Queue', queueUrl, message);
        return callback(e);
      });
    });
  `;
  */
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
    import json
    from api import ${name} as ${name}Runner

    def ${name}(event, context):
      if (event.get('__ping')):
        # __ping events are used by the keep-alive logic (to prevent Lambda's cooling)
        return '"pong__"'

      try:
        result = ${getRunnerCode(name, apiConfig)}

        ${hasEndpoint
          ? `
        # prepare response for api-gateway and auto stringify JSON if responseContentType is application/json
        if event.get('meta') and 'application/json' in event.get('meta').get('expectedResponseContentType'):
          return { 'response': json.dumps(result) }

        return {
          'response': result
        }
        `
        : `
        # else, if this function has no "path" configured, we return the value as-is
        return result
        `}

      except Exception as err:
        try:
          # Promise rejections should be Errors containing a JSON-stringified 'message property'
          # which contains the error information to be displayed.
          # If the property is not valid JSON, the error is not exposed to the client
          # and a generic HTTP 500 error will be exposed
          json.loads(err.message);
          print 'Lambda will terminate with error', err.message
          raise
        except ValueError as jsonErr:
          print 'Unhandled error will be swallowed and reported as HTTP 500:'
          print '%r' % err
          opaqueError = {
            'unhandled': True,
            'message': 'Unhandled internal error',
            'httpStatus': 500
          };
          raise Exception(json.dumps(opaqueError))
  `;
  return body;
}

export default function createIndex (apis, stackName) {
  const exportedFunctions = Object
   .keys(apis)
   .map(name => getWrappingCode(apis, name));
  // python: mind the indentations
  let code = `
${exportedFunctions.join('\n\n')}
  `;
  return code;
}
