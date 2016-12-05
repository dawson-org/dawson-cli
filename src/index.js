#!/usr/bin/env node

import 'babel-polyfill';
import 'hard-rejection/register';
import 'source-map-support/register';

import AWS from 'aws-sdk';
import updateNotifier from 'update-notifier';
import yargs from 'yargs';

import loadConfig from './config';
import pkg from '../package.json';
import { enableDebug, error, log } from './logger';
import { run as deployRun } from './commands/deploy';
import { run as describeRun } from './commands/describe';
import { run as logRun } from './commands/log';
import { run as proxyRun } from './commands/proxy';

const DAWSON_STAGE = process.env.DAWSON_STAGE || 'default';
const later = fn => (...args) => process.nextTick(() => fn(...args));
const notifier = updateNotifier({
  pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24
});
notifier.notify();

const argv = yargs
  .usage('$0 <command> [command-options]')

  .command('deploy', 'Deploy your app or a single function', () =>
    yargs
      .boolean('danger-delete-resources')
      .default('danger-delete-resources', false)
      .describe('danger-delete-resources', 'Allow APIs, Distributions, DynamoDB Tables, Buckets to be deleted/replaced as part of a stack update. YOU WILL LOOSE YOUR DATA AND CNAMEs WILL CHANGE!')
      .boolean('skip-acm')
      .default('skip-acm', false)
      .describe('skip-acm', 'Skip ACM SSL/TLS Certificate validation')
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('stage', 's')
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('verbose', 'v')
      .strict()
      .help()
  , later(deployRun))

  .command('log', 'Get last log lines for a Lambda', () =>
    yargs
      .describe('function-name', 'Function to retreive logs for')
      .alias('function-name', 'f')
      .demand('f')
      .describe('limit', 'Retreive the last <limit> events')
      .number('limit')
      .alias('limit', 'l')
      .default('limit', 200)
      .describe('request-id', 'Filter logs by Lambda RequestId')
      .alias('request-id', 'r')
      .describe('follow', 'Follow logs (never exit and keep polling and printing new lines)')
      .alias('follow', 't')
      .boolean('follow')
      .default('follow', false)
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('stage', 's')
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('verbose', 'v')
      .strict()
      .help()
  , later(logRun))

  .command('describe', 'List stack outputs', () =>
    yargs
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('stage', 's')
      .describe('output-name', 'Displays the Value of the specified Output')
      .alias('output-name', 'o')
      .describe('resource-id', 'Displays the PhysicalResourceId give its LogicalResourceId')
      .alias('resource-id', 'logical-resource-id')
      .alias('resource-id', 'r')
      .describe('shell', 'Bash-compatible output')
      .default('shell', false)
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('verbose', 'v')
      .strict()
      .help()
  , later(describeRun))

  .command('dev', 'Runs a development server proxying assets (from /) and API Gateway (from /prod)', () =>
    yargs
      .describe('assets-proxy', 'Serve static assets from this url URL (useful if you use Webpack Dev Server)')
      .alias('assets-proxy', 'assets-url')
      .describe('assets-path', 'Root directory to serve static assets from.')
      .describe('port', 'Port to listen to')
      .number('port')
      .alias('port', 'p')
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('stage', 's')
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('verbose', 'v')
      .strict()
      .help()
  , later(proxyRun))

  .help()
  .version()
  .demand(1)
  .strict()
  .argv;

if (!argv.help && !argv.version) {
  if (argv.stage && process.env.DAWSON_STAGE && argv.stage !== process.env.DAWSON_STAGE) {
    error('Configuration Error: you have specified both --stage and DAWSON_STAGE but they have different values.');
    process.exit(1);
  }

  if (!argv.stage) {
    error('Missing Configuration: we couldn\'t determine which stage to deploy to, please use the --stage argument or set DAWSON_STAGE.');
    process.exit(1);
  }

  if (!AWS.config.region) {
    error('Missing Configuration: you must set an AWS Region using the AWS_REGION environment variable.');
    process.exit(1);
  }

  if (!AWS.config.credentials) {
    error('Missing Configuration: no AWS Credentials could be loaded, please set AWS_PROFILE or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if applicable).');
    process.exit(1);
  }

  if (argv.verbose === true) {
    enableDebug();
  }

  const { PKG_JSON } = loadConfig();

  if (!argv.shell && !argv['output-name'] && !argv['resource-id']) {
    process.stdout.write('\x1B[2J\x1B[0f');
    log('');
    log('   dawson'.bold.blue, 'v' + pkg.version);
    log('  ', PKG_JSON.name.yellow.dim.bold, '↣', AWS.config.region.yellow.dim.bold, '↣', argv.stage.yellow.bold);
    log('  ', new Date().toLocaleString().gray);
    log('');
  }
}
