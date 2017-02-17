// DAWSON local development proxy (preview)
// ========================================
//
// This command will simulate the CloudFront distribution
//
// This feature is preview-quality
//

import AWS from 'aws-sdk';
import chalk from 'chalk';
import dockerLambda from 'docker-lambda';
import indent from 'indent-string';
import Listr from 'listr';
import minimatch from 'minimatch';
import pathModule from 'path';
import qs from 'querystring';
import send from 'send';
import util from 'util';
import verboseRenderer from 'listr-verbose-renderer';
import chokidar from 'chokidar';
import { compare } from 'pathmatch';
import { createProxyServer } from 'http-proxy';
import { createServer } from 'http';
import { oneLine, stripIndent } from 'common-tags';
import { parse } from 'url';
import { flatten } from 'lodash';

import createError from '../libs/error';
import loadConfig, { AWS_REGION, validateDocker } from '../config';
import taskCreateBundle from '../libs/createBundle';
import { debug, error, log, success, warning } from '../logger';
import {
  getStackOutputs,
  getStackResources
} from '../libs/aws/cfn-get-stack-info-helpers';
import { templateStackName } from '../factories/cloudformation';
import { templateLambdaRoleName } from '../factories/cf_lambda';

const sts = new AWS.STS({});
const iam = new AWS.IAM({});
const credentialsCache = new WeakMap();

function findApi ({ method, pathname, API_DEFINITIONS }) {
  let found = null;
  Object.keys(API_DEFINITIONS).forEach(name => {
    if (found) return;
    const fn = API_DEFINITIONS[name];
    const def = fn.api;
    if (!def) return;
    if (def.path === false) return;
    if (typeof def.path === 'undefined') return;
    if ((def.method || 'GET') !== method) return;
    const defPath = `/${def.path}`;
    const result = compare(defPath, pathname);
    if (result !== false) {
      debug(`API handler method: ${name}`);
      found = fn;
      found.pathParams = {}; // [paramName]: paramValue };
      const [names, values] = result;
      names.forEach((paramName, paramIndex) => {
        found.pathParams[paramName] = values[paramIndex];
      });
    }
  });
  if (!found) {
    error(
      stripIndent`
      Error: dawson couldn't find any function to handle your request.
      If you have just added this method, have you restarted the proxy?
    `
    );
    throw new Error(`API not found at path ${pathname}`);
  }
  return found;
}

function getContentType (fn) {
  return fn.api.responseContentType || 'text/html';
}

function apiCallback (res, runner, responseError, responseData) {
  const contentType = getContentType(runner);
  if (responseError) {
    const errorResponse = JSON.parse(responseError.errorMessage);
    if (errorResponse.unhandled === true) {
      warning(
        'Unhandled Error:'.bold,
        oneLine`
        Your lambda function returned an invalid error. Error messages must be valid JSON.stringfy-ed strings and
        should contain an httpStatus (int) and a response (string|object) property. This error will be swallowed and a generic HTTP 500 response will be returned to the client.
        Please refer to the documentation for instruction on how to deliver proper error responses.
      `
      );
    }
    if (typeof errorResponse.response !== 'string') {
      errorResponse.response = 'unhandled error (check the console for details)';
    }
    res.writeHead(errorResponse.httpStatus || 500, {
      'Content-Type': contentType
    });
    if (contentType === 'application/json') {
      res.write(JSON.stringify(errorResponse));
    } else {
      res.write(errorResponse.response);
    }
    res.end();
    return;
  }
  if (
    runner.api.redirects &&
      responseData.response &&
      responseData.response.Location
  ) {
    const location = responseData.response.Location;
    res.writeHead(307, { 'Content-Type': 'text/plain', Location: location });
    res.write(`You are being redirected to ${location}`);
    res.end();
    return;
  }
  if (typeof responseData.response !== 'string') {
    error(
      `Your function must return a string (or an Object if 'responseContentType' is 'application/json')`
    );
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.write('dawson message: function returned an invalid body');
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType });
  if (typeof responseData.response === 'object') {
    res.write(JSON.stringify(responseData.response));
  } else {
    res.write(responseData.response);
  }
  log(`============== Log Fragment End ==============\n`.dim);
  res.end();
  return;
}

function getEnvVariables (outputs) {
  const envVariables = outputs.map(output => {
    return `DAWSON_${output.OutputKey}=${output.OutputValue}`;
  });
  return envVariables;
}

async function runDockerContainer (
  { runner, event, outputs, resources, PROJECT_ROOT },
  callback
) {
  if (!credentialsCache.has(runner)) {
    log(
      `   [STS] requesting AWS Temporary Credentials for Lambda '${runner.name}' (this will take a few seconds)`
    );
    const assumedRoleCredentials = await assumeRole(resources, runner);
    credentialsCache.set(runner, assumedRoleCredentials);
  }
  const credentials = credentialsCache.get(runner);
  const envVariables = getEnvVariables(outputs);
  try {
    log(`\n============= Log Fragment Begin =============`.dim);
    log(`Function name: `.bold, runner.name);
    const invokeResult = dockerLambda({
      event,
      taskDir: `${PROJECT_ROOT}/.dawson-dist`,
      handler: `dawsonindex.${runner.name}`,
      dockerArgs: []
        .concat(['-m', '512M'])
        .concat(['--env', `NODE_ENV=${process.env.NODE_ENV || 'development'}`])
        .concat(['--env', `AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}`])
        .concat([
          '--env',
          `AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}`
        ])
        .concat(['--env', `AWS_SESSION_TOKEN=${credentials.SessionToken}`])
        .concat(flatten(envVariables.map(v => ['--env', v]))),
      spawnOptions: { stdio: ['pipe', 'pipe', process.stdout] }
    });
    callback(runner, null, invokeResult);
  } catch (invokeError) {
    if (!invokeError.stdout) {
      error(`dawson Internal Error`.bold);
      console.dir(invokeError);
      return;
    }
    const parsedError = JSON.parse(
      invokeError.stdout.toString('utf8'),
      null,
      2
    );
    error(
      'Lambda terminated with error:\n',
      util.inspect(parsedError, { depth: 10, color: true })
    );
    callback(runner, parsedError, null);
  }
}

async function processAPIRequest (
  req,
  res,
  {
    body,
    outputs,
    resources,
    pathname,
    querystring,
    API_DEFINITIONS,
    PROJECT_ROOT
  }
) {
  try {
    var runner = findApi({ method: req.method, pathname, API_DEFINITIONS });
  } catch (e) {
    if (e.message.match(/API not found at path/)) {
      const message = `API not found at path '${req.url}'`;
      console.log(message.bold.red);
      res.writeHead(404);
      res.write(message);
      res.end();
      return;
    } else {
      throw e;
    }
  }
  let expectedResponseContentType = runner.api.responseContentType ||
    'text/html';
  if (runner.api.redirects) {
    expectedResponseContentType = 'text/plain';
  }
  const event = {
    params: {
      path: { ...(runner.pathParams || {}) },
      querystring,
      header: req.headers
    },
    body,
    meta: { expectedResponseContentType }
  };
  debug('Event parameter:'.gray.bold, JSON.stringify(event, null, 2).gray);

  const authorizer = runner.api.authorizer;
  const executeCall = () =>
    runDockerContainer(
      { res, runner, event, outputs, resources, PROJECT_ROOT },
      (...args) => apiCallback(res, ...args)
    );

  if (!authorizer) {
    executeCall();
  } else {
    runAuthorizer({
      authorizer,
      event,
      req,
      res,
      outputs,
      successCallback: executeCall
    });
  }
}

function findRoleName (stackResources, runner) {
  const functionName = runner.name;
  const lambdaName = functionName[0].toUpperCase() + functionName.substring(1);
  const cfLogicalRoleName = templateLambdaRoleName({ lambdaName });
  let found = null;
  stackResources.forEach(resource => {
    if (resource.LogicalResourceId === cfLogicalRoleName) {
      found = resource.PhysicalResourceId;
    }
  });
  if (!found) {
    throw new Error(`Cannot find an IAM Role for '${cfLogicalRoleName}'`);
  }
  return found;
}

async function assumeRole (stackResources, runner) {
  const roleName = findRoleName(stackResources, runner);
  const getRoleResult = await iam.getRole({ RoleName: roleName }).promise();
  const roleArn = getRoleResult.Role.Arn;
  debug('   [AWS STS] Assuming Role ARN', roleArn);
  const assumeRoleParams = {
    RoleArn: roleArn,
    RoleSessionName: 'dawson-dev-proxy',
    DurationSeconds: 900
  };
  const assumedRole = await sts.assumeRole(assumeRoleParams).promise();
  debug(
    '   [AWS STS] Assumed Credentials',
    assumedRole.Credentials.AccessKeyId
  );
  return assumedRole.Credentials;
}

function runAuthorizer (
  { authorizer, event, req, res, successCallback, outputs }
) {
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html
  // @TODO: correctly handle 401, 403, 500 response as described in the documentation

  const token = event.params.header.token;
  log(`   🔒 Invoking authorizer, token = ${util.inspect(token)}`.yellow.dim);

  const fail = (httpStatusCode = 403, ...logs) => {
    error(...logs);
    res.writeHead(httpStatusCode, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify({ message: 'Unauthorized' }));
    res.end();
  };

  if (!token) {
    fail(
      401,
      '   🔒'.red,
      `No authorization header found. You must specify a 'token' header with your request.`.red
    );
    return;
  }

  const envVariables = getEnvVariables(outputs);
  envVariables.forEach(declaration => {
    const [key, value] = declaration.split('=');
    process.env[key] = value;
  });

  authorizer(
    { type: 'TOKEN', authorizationToken: token, methodArn: 'arn:fake' },
    {
      succeed: ({ policyDocument, principalId, context }) => {
        if (
          !Object.values(context).every(val =>
            ['number', 'string', 'boolean'].includes(typeof val))
        ) {
          throw new Error(
            'Authorizer Error: augmented context values can only be of type number, string or boolean.'
          );
        }
        if (!policyDocument || !Array.isArray(policyDocument.Statement)) {
          fail(
            403,
            '   🔒'.red,
            `Authorizer did not return a policy document`.red,
            policyDocument
          );
          return;
        }
        if (
          !policyDocument.Statement.find(
            item =>
              item.Effect === 'Allow' &&
                item.Action === 'execute-api:Invoke' &&
                item.Resource === 'arn:fake'
          )
        ) {
          fail(
            403,
            '   🔒'.red,
            `Authorizer did not return a valid policy document`.red,
            policyDocument
          );
          return;
        }
        event.context = {
          ...event.context,
          authorizer: { ...(event.context || {}).authorizer, ...context },
          principalId
        };
        console.log(`   🔓 Authorization succeeded`.yellow.dim);
        successCallback();
      },
      fail: message => {
        fail(
          403,
          '   🔒'.red,
          `Authorizer failed with message: '${message}'`.red
        );
      }
    }
  );
}

function requestForAPI (req, SETTINGS) {
  if (SETTINGS.cloudfrontRootOrigin === 'assets') {
    return req.url.startsWith('/prod');
  } else {
    return !req.url.startsWith('/assets');
  }
}

function parseAPIUrl (req, SETTINGS) {
  let urlString;
  if (SETTINGS.cloudfrontRootOrigin === 'assets') {
    urlString = req.url.replace('/prod', '');
  } else {
    urlString = req.url;
  }
  const url = parse(urlString);
  return url;
}

function parseAssetsUrlString (req, SETTINGS) {
  let urlString;
  if (SETTINGS.cloudfrontRootOrigin !== 'assets') {
    urlString = req.url.replace('/assets', '');
  } else {
    urlString = req.url;
  }
  if (urlString.indexOf('?') !== -1) {
    urlString = urlString.substring(0, urlString.indexOf('?'));
  }
  return urlString;
}

let outputsAndResourcesCache = null;
async function getOutputsAndResources ({ stackName }) {
  if (!outputsAndResourcesCache) {
    outputsAndResourcesCache = await Promise.all([
      getStackOutputs({ stackName }),
      getStackResources({ stackName })
    ]);
  }
  return outputsAndResourcesCache;
}

function createBundle ({ stage, stackName, onlyCompile = false, skipChmod }) {
  return taskCreateBundle({
    appStageName: stage,
    noUpload: true,
    onlyCompile,
    stackName,
    skipChmod
  });
}

export function run (argv) {
  const { SETTINGS, API_DEFINITIONS, APP_NAME, PROJECT_ROOT } = loadConfig();
  validateDocker();
  const {
    stage,
    assetsProxy,
    assetsPath,
    verbose,
    skipChmod,
    fastStartup
  } = argv;
  const onlyCompile = fastStartup;
  const port = argv.port || process.env.PORT || 3000;

  const stackName = templateStackName({ appName: APP_NAME, stage });

  const proxy = createProxyServer({});
  // Proxy errors
  proxy.on('error', err => {
    error(`Proxy request error: ${err.message}`.bold.red);
  });

  let outputs, resources;

  const server = createServer((req, res) => {
    debug(` -> ${req.method} ${req.url}`);
    debug(`    Content-Type: ${req.headers['content-type']}`);

    if (req.url === '/favicon.ico') {
      res.writeHead(404);
      res.end();
      return;
    }

    if (
      req.headers['content-type'] &&
        !['application/json', 'application/x-www-form-urlencoded'].includes(
          req.headers['content-type']
        )
    ) {
      res.writeHead(415);
      res.write('Unsupported media type');
      res.end();
      return;
    }

    if (requestForAPI(req, SETTINGS)) {
      const url = parseAPIUrl(req, SETTINGS);
      const pathname = url.pathname;
      const querystring = qs.parse(url.query);
      let rawBody = new Buffer('');
      let jsonBody = {};
      const next = () => {
        processAPIRequest(req, res, {
          pathname,
          querystring,
          body: jsonBody,
          outputs,
          resources,
          API_DEFINITIONS,
          PROJECT_ROOT
        });
      };
      if (
        req.method === 'GET' ||
          req.method === 'OPTIONS' ||
          req.method === 'HEAD'
      ) {
        next();
        return;
      }
      req.on('data', chunk => {
        rawBody = Buffer.concat([rawBody, chunk]);
      });
      req.on('end', () => {
        rawBody = Buffer.concat([rawBody]);
        const rawUTFBody = rawBody.toString('utf8');

        if (
          req.headers['content-type'] === 'application/x-www-form-urlencoded'
        ) {
          jsonBody = rawUTFBody;
        } else if (req.headers['content-type'] === 'application/json') {
          try {
            jsonBody = JSON.parse(rawUTFBody);
          } catch (err) {
            error(`Could not parse JSON request body`.red.bold, rawUTFBody.red);
            res.writeHead(400);
            res.write('Request body is not a valid JSON string');
            res.end();
            return;
          }
        }

        next();
      });
      req.resume();
    } else {
      if (assetsPath) {
        const path = parseAssetsUrlString(req, SETTINGS);
        send(req, path, {
          cacheControl: false,
          root: pathModule.join(PROJECT_ROOT, assetsPath)
        })
          .on('error', error => {
            res.writeHead(error.status || 500);
            const message = `Resource not found (root: ${pathModule.join(
              PROJECT_ROOT,
              assetsPath
            )}) at path '${path}'`;
            warning(message);
            res.write(message);
            res.end();
          })
          .pipe(res);
      } else {
        if (assetsProxy) {
          proxy.web(req, res, { target: assetsProxy });
        } else {
          warning(
            '\n',
            oneLine`
            Proxy doesn't know how to handle request for '${req.url}',
            because your did not provide --assets-url nor --assets-path
          `
          );
          res.writeHead(500);
          res.end();
        }
      }
    }
  });

  server.on('clientError', err => {
    error('Server error', err);
  });

  const startupTasks = new Listr(
    [
      {
        title: 'creating first bundle',
        task: () => createBundle({ stage, stackName, skipChmod, onlyCompile })
      },
      {
        title: 'validating AWS resources',
        task: () => new Listr([
          {
            title: 'getting stack details from CloudFormation',
            task: () => {
              return getOutputsAndResources({ stackName })
                .catch(e => {
                  throw createError({
                    kind: 'Failed to describe CloudFormation Stack',
                    reason: (
                      `dawson could not find a CloudFormation stack for your app.`
                    ),
                    detailedReason: (
                      stripIndent`
                    The stack named '${stackName}' (stage: ${stage}, region: ${AWS_REGION})
                    cannot be described.
                    AWS Error: "${e.message}"
                    If this is the first time you are using this app,
                    you just need to run $ dawson deploy
                  `
                    ),
                    solution: (
                      stripIndent`
                    * deploy this app / stage (check AWS_STAGE or --stage)
                    * use the correct AWS Account (check AWS_PROFILE, AWS_ACCESS_KEY_ID)
                    * use the correct region (check AWS_REGION)
                    * check the 'name' property in your package.json
                  `
                    )
                  });
                })
                .then(([_outputs, _resources]) => {
                  [outputs, resources] = [_outputs, _resources];
                });
            }
          },
          {
            title: 'checking IAM Roles',
            task: () => {
              Object.values(API_DEFINITIONS).every(runner => {
                if (runner.name === 'customTemplateFragment') {
                  return true;
                }
                if (runner.name === 'processCFTemplate') {
                  return true;
                }
                try {
                  const roleName = findRoleName(resources, runner);
                  debug(
                    `Function '${runner.name}' will execute with IAM Role '${roleName}'`
                  );
                  return true;
                } catch (e) {
                  throw createError({
                    kind: 'Missing resources',
                    reason: (
                      `Function '${runner.name}' has not yet been deployed.`
                    ),
                    detailedReason: (
                      stripIndent`
                    dawson couldn't find any role to use when executing this function.
                    This happens when you're invoking a function that has never been deployed before.
                    Before a function can be executed, it must have been deployed at least once.
                  `
                    ),
                    solution: 'execute $ dawson deploy, wait for the deploy to complete and then run this command again.'
                  });
                }
              });
            }
          }
        ])
      }
    ],
    { concurrent: true, renderer: verbose ? verboseRenderer : undefined }
  );

  startupTasks
    .run()
    .then(() => {
      server.listen(port);
      success(
        '\n' +
          indent(
            stripIndent`
      Development proxy started
      http://0.0.0.0:${port}
    `,
            3
          )
      );

      // startup banner:
      //  / ⇒ <ASSETS LOCATION>
      //  ⤷ /prod ⇒ <api>
      //  ⤷ /assets ⇒ <ASSETS LOCATION>

      const rootIsAPI = requestForAPI({ url: '/' }, SETTINGS);
      let assetsLocation = '(assets location not configured)';
      if (assetsPath) {
        assetsLocation = `${PROJECT_ROOT}/assets/`;
      }
      if (assetsProxy) {
        assetsLocation = `${assetsProxy}`;
      }
      log(
        '\n',
        indent(
          stripIndent`
      / ⇒ ${rootIsAPI ? '<api>' : `${assetsLocation}`}
       ${rootIsAPI ? `⤷ /assets ⇒ ${assetsLocation}` : `⤷ /prod ⇒ <api>`}
    `,
          3
        )
      );
      log('');

      setupWatcher({ stage, stackName, ignore: SETTINGS.ignore, PROJECT_ROOT });
    })
    .catch(err => {
      if (err.isDawsonError) {
        console.error(err.toFormattedString());
        process.exit(1);
      }
      console.error(chalk.red.bold('dawson internal error:'), err.message);
      console.error(err.stack);
      console.error(
        chalk.red(
          `Please report this bug: https://github.com/dawson-org/dawson-cli/issues`
        )
      );
      process.exit(1);
    });
}

function setupWatcher ({ stage, stackName, ignore = [], PROJECT_ROOT }) {
  const ignoreList = [
    ...ignore,
    '**/node_modules/**',
    '**/.dawson-dist/**',
    '**/~*',
    '**/.*'
  ];
  let bundleInProgress = false;
  const onWatch = fileName => {
    if (bundleInProgress) {
      return;
    }

    if (ignoreList.some(pattern => minimatch(fileName, pattern, { dot: true }))) {
      debug(`   Reload: [ignored] ${fileName}`.dim);
      return;
    }

    log(`   Reload: ${fileName}...`.dim);
    bundleInProgress = true;
    createBundle({ stage, stackName, onlyCompile: true })
      .run()
      .then(() => {
        bundleInProgress = false;
        log(
          `   Reload:`.dim,
          `reloaded at ${new Date().toLocaleTimeString()}`.yellow
        );
      })
      .catch(err => {
        bundleInProgress = false;
        throw err;
      });
  };
  const watchEE = chokidar.watch(PROJECT_ROOT, {
    ignored: ignoreList,
    ignoreInitial: true,
    persistent: true,
    atomic: true
  });
  watchEE.on('ready', () => {
    log(
      indent(
        stripIndent`
      Reload: watching ${PROJECT_ROOT}/** for changes.
              The proxy will auto reload on file changes.
              You must manually restart the proxy when
                * adding or updating npm dependencies
                * adding a Lambda function or updating its configuration
                * updating Lambda policyStatements
                * updating CloudFormation resources
    `.dim,
        3
      )
    );
    log('');
  });
  watchEE.on('change', onWatch);
  watchEE.on('add', onWatch);
}
