#!/usr/bin/env node

import 'source-map-support/register';
import 'hard-rejection/register';

import yargs from 'yargs';
import AWS from 'aws-sdk';

import updateNotifier from 'update-notifier';
import pkg from '../package.json';
import loadConfig from './config';

const notifier = updateNotifier({
  pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24
});
notifier.notify();

import { enableDebug, log, error } from './logger';
import { run as deployRun } from './commands/deploy';
import { run as logRun } from './commands/log';
import { run as describeRun } from './commands/describe';
import { run as proxyRun } from './commands/proxy';

const later = fn => (...args) => process.nextTick(() => fn(...args));

const DAWSON_STAGE = process.env.DAWSON_STAGE || 'default';

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
      .alias('s')
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('v')
      .strict()
      .help()
  , later(deployRun))

  .command('log', 'Get last log lines for a Lambda', () =>
    yargs
      .describe('function-name', 'Function to retreive logs for')
      .alias('f', 'function-name')
      .demand('f')
      .describe('limit', 'Retreive the last <limit> events')
      .number('limit')
      .alias('l', 'limit')
      .default('limit', 200)
      .describe('request-id', 'Filter logs by Lambda RequestId')
      .alias('r', 'request-id')
      .describe('follow', 'Follow logs, i.e. never exit and keep polling and printing new lines')
      .alias('-t', 'follow')
      .boolean('follow')
      .default('follow', false)
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('s')
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('v')
      .strict()
      .help()
  , later(logRun))

  .command('describe', 'List stack outputs', () =>
    yargs
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('s')
      .describe('output-name', 'You can request a single value. Specify the corresponding OutputName. The output of this command is pipeable, for using in bash scripts etc.')
      .alias('o')
      .describe('shell', 'Outputs bash-compatible variable declarations')
      .alias('s')
      .default('shell', false)
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('v')
      .strict()
      .help()
  , later(describeRun))

  .command('dev', 'Runs a development server proxying assets (from /) and API Gateway (from /prod)', () =>
    yargs
      .describe('assets-proxy', 'Serve static assets from this url URL (useful if you use Webpack Dev Server)')
      .alias('assets-url', 'assets-proxy')
      .describe('assets-path', 'Root directory to serve static assets from.')
      .describe('port', 'Port to listen on')
      .demand('port')
      .number('port')
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('s')
      .describe('verbose', 'Verbose output')
      .boolean('verbose')
      .alias('v')
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

  if (!argv.shell && !argv['output-name']) {
    process.stdout.write('\x1B[2J\x1B[0f');
    log('');
    log('   dawson'.bold.blue, 'v' + pkg.version);
    log('  ', PKG_JSON.name.yellow.dim.bold, '↣', AWS.config.region.yellow.dim.bold, '↣', argv.stage.yellow.bold);
    log('  ', new Date().toLocaleString().gray);
    log('');
  }
}
