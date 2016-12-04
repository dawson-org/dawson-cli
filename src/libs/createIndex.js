
import { stripIndent } from 'common-tags';

import { error } from '../logger';

function getWrappingCode (apis, name) {
  const apiConfig = apis[name].api || {};
  const hasEndpoint = apiConfig.path !== false;
  const body = stripIndent`
    module.exports.${name} = function (event, context, callback) {
      context.dawsonDescribeOutputs = dawsonDescribeOutputs;
      const runner = require('./api').${name};
      Promise.resolve()
      .then(function () {
        return runner(event, context);
      })
      .then(function (data) {
        ${hasEndpoint
          ? stripIndent`
            if (event.meta && event.meta.expectedResponseContentType.indexOf('application/json') !== -1) {
              return callback(null, { response: JSON.stringify(data) });
            }
            callback(null, { response: data });
          `
          : stripIndent`
            // this function has not been called via API Gateway, we return the value as-is
            return callback(null, data);
          `
        }
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

function prepareIndexFile (apis, stackName) {
  const exportedFunctions = Object.keys(apis).map(name => getWrappingCode(apis, name));

  return stripIndent`
    require('babel-polyfill');

    const stackName = '${stackName}';
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
          console.error(\`Error describing stack ${stackName}\`, err.message, err.stack);
          throw err;
        });
      } else {
        return Promise.resolve(stackOutputs);
      }
    }

    ${exportedFunctions.join('\n\n')}
  `;
}

export default function compileCode (apis, stackName) {
  try {
    const str = prepareIndexFile(apis, stackName);
    return Promise.resolve(str);
  } catch (err) {
    error('Compiler error', err);
    return Promise.reject(err);
  }
}

