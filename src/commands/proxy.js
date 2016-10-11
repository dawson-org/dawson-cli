
// DAWSON local development proxy (preview)
// ========================================
//
// This command will simulate the CloudFront distribution behaviours
//
// Currently, this proxy DOES NOT SUPPORT:
// - multiple path parameters
// - "big" requests that does not fit in a single chunk (will restult in a JSON error)
//
// This feature is preview-quality, we need error checking, etc...
//

import assert from 'assert';
import qs from 'querystring';
import { createProxyServer } from 'http-proxy';
import send from 'send';
import { createServer } from 'http';
import { parse } from 'url';
import pathModule from 'path';

import { debug, error, success } from '../logger';
import { SETTINGS, API_DEFINITIONS } from '../config';
const { appName } = SETTINGS;
import { RUNNER_FUNCTION_BODY } from '../libs/compiler';
import { compare } from '../libs/pathmatch';

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

function findApi ({ method, pathname }) {
  let found = null;
  Object.keys(API_DEFINITIONS).forEach(name => {
    if (found) return;
    const fn = API_DEFINITIONS[name];
    const def = fn.api;
    if (!def) return;
    if (def.path === false) return;
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

function processAPIRequest (req, res, { body, outputs, pathname, querystring }) {
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
    // eslint-disable-next-line
    const context = {};
    // eslint-disable-next-line
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
        data = JSON.parse(data.response);
        if (contentType === 'application/json') {
          res.write(JSON.stringify(data));
        } else if (contentType === 'text/plain') {
          res.write(data);
        } else if (contentType === 'text/html') {
          res.write(data);
        } else {
          throw new Error('Unknown contentType: ' + contentType);
        }
      }
      console.log(` <- END '${runner.name}' (${new Intl.NumberFormat().format(data.length / 1024)} KB)\n`.red.dim);
      res.end();
    };
    /*
      eval uses these vars:
      - runner
      - event
      - context (unused internally)
      - callback
    */
    console.log(`\n -> START '${runner.name}'`.green.dim);
    // eslint-disable-next-line
    eval(RUNNER_FUNCTION_BODY);
  } catch (err) {
    error('processAPIRequest error', err);
  }
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
  return urlString;
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
        getStackOutputs({ stackName })
        .then(outputs => {
          processAPIRequest(req, res, {
            pathname,
            querystring,
            body: jsonBody,
            outputs
          });
        })
        .catch(err => {
          error('getStackOutputs Error', err);
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
      const path = parseAssetsUrlString(req); // conditionally replace assets/

      if (assetsPathname) {
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
