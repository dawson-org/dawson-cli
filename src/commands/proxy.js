
// DAWSON local development proxy (preview)
// ========================================
//
// This command will simulate the CloudFront distribution
//
// Currently, this proxy DOES NOT SUPPORT "big" requests that
//  does not fit in a single chunk (will result in a JSON error)
//
// This feature is preview-quality, we need error checking, etc...
//

import assert from 'assert';
import qs from 'querystring';
import fs from 'fs';
import { createProxyServer } from 'http-proxy';
import send from 'send';
import { createServer } from 'http';
import { parse } from 'url';
import pathModule from 'path';
import dockerLambda from 'docker-lambda';
import { stripIndent } from 'common-tags';

import { log, debug, error, success } from '../logger';
import { SETTINGS, API_DEFINITIONS } from '../config';
const { appName } = SETTINGS;
import compileCode from '../libs/compiler';
import { compare } from '../libs/pathmatch';

import AWS from 'aws-sdk';
const sts = new AWS.STS({});
const iam = new AWS.IAM({});

const credentialsCache = new WeakMap();

import {
  getStackOutputs,
  getStackResources,
  templateStackName
} from '../factories/cf_utils';

import {
  templateLambdaRoleName
} from '../factories/cf_lambda';

function findApi ({ method, pathname }) {
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
    throw new Error(`API not found at path ${pathname}`);
  }
  return found;
}

function getContentType (fn) {
  return fn.api.responseContentType || 'text/html';
}

async function processAPIRequest (req, res, { body, resources, outputs, pathname, querystring }) {
  try {
    const stageVariables = {};
    outputs.forEach(output => {
      stageVariables[output.OutputKey] = output.OutputValue;
    });
    try {
      var runner = findApi({ method: req.method, pathname });
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
    const event = {
      params: {
        path: {
          ...(runner.pathParams || {})
        },
        querystring,
        header: req.headers
      },
      body,
      meta: {
        expectedResponseContentType: 'application/json'
      },
      stageVariables
    };
    debug('Event parameter:'.gray.bold, JSON.stringify(event, null, 2).gray);
    const callback = function apiCallback (err, data) {
      if (err) {
        error(`Request Error: ${err.message}`);
        error(err);
        return;
      }
      const contentType = getContentType(runner);
      res.writeHead(200, { 'Content-Type': contentType });
      if (!data) {
        error(`Handler returned an empty body`);
      } else {
        const response = JSON.parse(data.response);
        if (contentType === 'application/json') {
          res.write(JSON.stringify(response));
        } else if (contentType === 'text/plain') {
          res.write(response);
        } else if (contentType === 'text/html') {
          res.write(response);
        } else {
          res.write(data);
        }
        console.log(` <- END '${runner.name}' (${new Intl.NumberFormat().format(data.response.length / 1024)} KB)\n`.red.dim);
      }
      res.end();
    };
    console.log(`\n -> START '${runner.name}'`.green.dim);

    if (!credentialsCache.has(runner)) {
      credentialsCache.set(runner, await assumeRole(resources, runner));
    }
    const credentials = credentialsCache.get(runner);

    try {
      log(`[internal] executing docker container`);
      const invokeResult = dockerLambda({
        event,
        handler: `daniloindex.${runner.name}`,
        spawnOptions: {
          stdio: [null, 'pipe', 'inherit'] // docker-lambda uses stdout to communicate back with us
        },
        dockerArgs: []
          .concat(['-m', '512M'])
          .concat(['--env', `NODE_ENV=${process.env.NODE_ENV || 'development'}`])
          .concat(['--env', `AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}`])
          .concat(['--env', `AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}`])
          .concat(['--env', `AWS_SESSION_TOKEN=${credentials.SessionToken}`])
      });
      callback(null, invokeResult);
    } catch (invokeError) {
      const stdErr = invokeError.stderr ? invokeError.stderr.toString('utf8') : '"no data"';
      const stdOut = invokeError.stdout ? invokeError.stdout.toString('utf8') : '"no data"';
      error('Error executing lambda. Function output:');
      error(stdErr);
      error('Error reported by docker-lambda', invokeError);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(formatError(JSON.parse(stdOut)));
    }
  } catch (err) {
    error('An error occurred while executing this function.\n', err);
  }
}

function findRoleName (stackResources, cfLogicalName) {
  let found = null;
  stackResources.forEach(resource => {
    if (resource.LogicalResourceId === cfLogicalName) {
      found = resource.PhysicalResourceId;
    }
  });
  if (!found) {
    throw new Error(`Cannot find an IAM Role for '${cfLogicalName}'`);
  }
  return found;
}

async function assumeRole (stackResources, runner) {
  const functionName = runner.name;
  const lambdaName = functionName[0].toUpperCase() + functionName.substring(1);
  const cfLogicalRoleName = templateLambdaRoleName({ lambdaName });
  const roleName = findRoleName(stackResources, cfLogicalRoleName);
  log('[internal] getting Role ARN');
  const getRoleResult = await iam.getRole({
    RoleName: roleName
  }).promise();
  const roleArn = getRoleResult.Role.Arn;
  const assumeRoleParams = {
    RoleArn: roleArn,
    RoleSessionName: 'dawson-dev-proxy'
  };
  log('[internal] calling AssumeRole');
  const assumedRole = await sts.assumeRole(assumeRoleParams).promise();
  return assumedRole.Credentials;
}

function formatError (err) {
  return stripIndent`
    <DOCTYPE html>
    <html>
      <head>
        <style>
          body { padding: 10px; color: black; background-color: red; }
          .error { width: 100%; font-family: monospace; white-space: pre-wrap; }
        </style>
        <title>Lambda Execution Error</title>
      <body>
        <div class="error"><strong>${err.errorType}: ${err.errorMessage}</strong><br />${err.stackTrace.join('\n')}</div>
  `;
}

function requestForAPI (req) {
  if (SETTINGS.cloudfrontRootOrigin === 'assets') {
    return req.url.startsWith('/prod');
  } else {
    return !req.url.startsWith('/assets');
  }
}

function parseAPIUrl (req) {
  let urlString;
  if (SETTINGS.cloudfrontRootOrigin === 'assets') {
    urlString = req.url.replace('/prod', '');
  } else {
    urlString = req.url;
  }
  const url = parse(urlString);
  return url;
}

function parseAssetsUrlString (req) {
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
    log('[internal] describing stack');
    outputsAndResourcesCache = await Promise.all([
      getStackOutputs({ stackName }),
      getStackResources({ stackName })
    ]);
  }
  return outputsAndResourcesCache;
}

export function run (argv) {
  const {
    stage,
    port,
    proxyAssetsUrl,
    assetsPathname
  } = argv;

  assert(proxyAssetsUrl || assetsPathname, 'You must specify either --proxy-assets-url or --assets-pathname');

  const stackName = templateStackName({ appName, stage });
  compileCode(API_DEFINITIONS, stackName)
    .then(indexFileContents => {
      fs.writeFileSync('daniloindex.js', indexFileContents, { encoding: 'utf-8' });
      log('[internal] created root index file');
    })
    .catch(err => error('Cannot create root index file', err));

  const proxy = createProxyServer({});
  // Proxy errors
  proxy.on('error', err => {
    error(`Proxy request error: ${err.message}`.bold.red);
  });

  const server = createServer((req, res) => {
    debug(` -> ${req.method} ${req.url}`);

    if (req.url === '/favicon.ico') {
      res.writeHead(404);
      res.end();
      return;
    }

    if (requestForAPI(req)) {
      const url = parseAPIUrl(req);
      const pathname = url.pathname;
      const querystring = qs.parse(url.query);
      let rawBody = new Buffer('');
      let jsonBody = {};
      const next = () => {
        Promise.resolve({ stackName })
        .then(getOutputsAndResources)
        .then(([ outputs, resources ]) =>
          processAPIRequest(req, res, {
            pathname,
            querystring,
            body: jsonBody,
            outputs,
            resources
          }))
        .catch(err => {
          error('Error resolving promise for getStackOutputs,getStackResources', err);
        });
      };
      if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
        next();
        return;
      }
      req.on('data', chunk => {
        rawBody = Buffer.concat([rawBody, chunk]);
        const rawUTFBody = rawBody.toString('utf8');
        try {
          jsonBody = JSON.parse(rawUTFBody);
        } catch (err) {
          error(`Could not parse JSON request body`.red.bold, rawUTFBody.red);
          jsonBody = {};
        }
        next();
      });
      req.resume();
    } else {
      if (assetsPathname) {
        const path = parseAssetsUrlString(req);
        send(req, path, {
          cacheControl: false,
          root: pathModule.join(process.cwd(), assetsPathname)
        })
        .on('error', error => {
          res.writeHead(error.status || 500);
          const message = `Resource not found in '/assets' at path '${path}'`;
          console.log(message.yellow.bold);
          res.write(message);
          res.end();
        })
        .pipe(res);
      } else {
        proxy.web(req, res, {
          target: proxyAssetsUrl
        });
      }
    }
  });

  server.on('clientError', err => {
    error('Server error', err);
  });

  server.listen(port);
  process.stdout.write('\x1B[2J\x1B[0f');
  success(`\nDevelopment proxy listening on http://0.0.0.0:${port}`.bold.green);
}
