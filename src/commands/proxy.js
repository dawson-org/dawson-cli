
// DAWSON local development proxy (preview)
// ========================================
//
// This command will parse requests to '/prod' and call the appropriate API function.
// All requests that do not begin with '/prod' will be forwarded to the address specified
//    by --proxy-assets-url
//
// Currently, this proxy DOES NOT SUPPORT:
// - multiple path parameters
// - "big" requests that does not fit in a single chunk (will restult in a JSON error)
// - requests/responses of type other than application/json (text/html is not supported)
//
// Currently, this proxy assumes that you are building a Single-Page-App with a backend API, and it will only
// be useful for this use case.
//
// This feature is preview-quality, we need error checking, etc...
//

import assert from 'assert';
import qs from 'querystring';
import { createProxyServer } from 'http-proxy';
import { createServer } from 'http';
import { parse } from 'url';

import { debug, error, success } from '../logger';
import { SETTINGS, API_DEFINITIONS } from '../config';
const { appName } = SETTINGS;
import { RUNNER_FUNCTION_BODY } from '../libs/compiler';

import {
  getStackOutputs,
  templateStackName
} from '../factories/cf_utils';

function equalToIndex (toIndex, a, b) {
  // Returns true iff arrays a and b have all equal
  // elements until index toIndex (included)
  let equal = true;
  a.forEach((itemA, indexA) => {
    if (indexA > toIndex) return;
    if (itemA !== b[indexA]) equal = false;
  });
  return equal;
}

function findApi ({ method, pathname }) {
  let found = null;
  Object.keys(API_DEFINITIONS).forEach(name => {
    if (found) return;
    const fn = API_DEFINITIONS[name];
    const def = fn.api;
    if (!def) return;
    const defPath = `/${def.path}`;
    if (defPath === pathname && (def.method || 'GET') === method) {
      debug(`API handler method: ${name}`);
      found = fn;
    }
    if (!def.path.includes('{')) return;
    // @BUG @FIXME this will only support one path parameter
    const splitDefPath = defPath.split('/');
    const splitPath = pathname.split('/');
    const paramNameIndex = splitDefPath.findIndex(t => t.includes('{'));
    if (!equalToIndex(paramNameIndex - 1, splitPath, splitDefPath)) {
      return;
    }
    const paramName = splitDefPath[paramNameIndex].replace('{', '').replace('}', '');
    const paramValue = splitPath[paramNameIndex];
    if (typeof paramValue === 'string' && paramValue.length > 0) {
      found = fn;
      found.pathParams = { [paramName]: paramValue };
    }
  });
  if (!found) {
    throw new Error(`API not found at path ${pathname}`);
  }
  return found;
}

function processAPIRequest (req, res, { body, outputs, pathname, querystring }) {
  try {
    const stageVariables = {};
    outputs.forEach(output => {
      stageVariables[output.OutputKey] = output.OutputValue;
    });
    const runner = findApi({ method: req.method, pathname });
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (!data) {
        error(`Handler returned an empty body`);
      } else {
        data.response = JSON.parse(data.response);
        res.write(JSON.stringify(data));
      }
      debug(' -> request end');
      res.end();
    };
    /*
      eval uses these vars:
      - runner
      - event
      - context (unused internally)
      - callback
    */
    // eslint-disable-next-line
    eval(RUNNER_FUNCTION_BODY);
  } catch (err) {
    error('processAPIRequest error', err);
  }
}

export function run (argv) {
  const {
    stage,
    port,
    proxyAssetsUrl,
    assetsPathname
  } = argv;

  assert(proxyAssetsUrl, 'Serving from a filder is not implemented yet, you should try --proxy-assets-url');
  assert(!assetsPathname, 'Option --assets-pathname is not implemented yet');
  assert(SETTINGS.cloudfrontRootOrigin === 'assets', 'This proxy currently only supports Single-Page-Applications (with cloudfrontRootOrigin === "assets" in package.json)');

  const stackName = templateStackName({ appName, stage });

  const proxy = createProxyServer({});
  // Proxy errors
  proxy.on('error', err => {
    error(`Proxy request error: ${err.message}`.bold.red);
  });

  const server = createServer((req, res) => {
    debug(` -> ${req.method} ${req.url}`);

    if (req.url.startsWith('/prod')) {
      req.url = req.url.replace('/prod', '');
      const url = parse(req.url);
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
      proxy.web(req, res, {
        target: proxyAssetsUrl
      });
    }
  });

  server.on('clientError', err => {
    error('Server error', err);
  });

  server.listen(port);
  success(`\nDevelopment proxy listening on http://0.0.0.0:${port}`.bold.green);
}
