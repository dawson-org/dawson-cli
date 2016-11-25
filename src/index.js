#!/usr/bin/env node

import 'hard-rejection/register';

import yargs from 'yargs';
import AWS from 'aws-sdk';

import updateNotifier from 'update-notifier';
import pkg from '../package.json';
import { PKG_JSON } from './config';

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

  .describe('verbose', 'Enable verbose logging')
  .boolean('verbose')
  .alias('v')

  .command('deploy', 'Deploy your app or a single function', () =>
    yargs
      .describe('function-name', 'When the deploy is completed, tail logs for this function')
      .alias('f', 'function-name')
      .boolean('no-uploads')
      .default('no-uploads', false)
      .describe('no-uploads', 'Do not create/upload lambda zips')
      .alias('U', 'no-uploads')
      .boolean('danger-delete-resources')
      .default('danger-delete-resources', false)
      .describe('danger-delete-resources', 'Allow APIs, Distributions, DynamoDB Tables, Buckets to be deleted/replaced as part of a stack update. YOU WILL LOOSE YOUR DATA AND CNAMEs WILL CHANGE!')
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('s')
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
      .help()
  , later(describeRun))

  .command('dev', 'Runs a development server proxying assets (from /) and API Gateway (from /prod)', () =>
    yargs
      .describe('proxy-assets-url', 'Serve the root from this url URL (useful if you use Webpack Dev Server)')
      // .describe('assets-pathname', 'Requires --proxy-assets-url. Pathname to match for proxying assets.')
      .describe('port', 'Port to listen on')
      .demand('port')
      .number('port')
      .describe('stage', 'Application stage to work on')
      .default('stage', DAWSON_STAGE)
      .alias('s')
      .help()
  , later(proxyRun))

  .demand(1)
  .help()
  .argv;

if (!PKG_JSON.name) {
  error('Missing Configuration: You need to specify a `name` field in package.json');
  process.exit(1);
}

if (argv.stage && process.env.DAWSON_STAGE && argv.stage !== process.env.DAWSON_STAGE) {
  error('Configuration Error: you have specified both --stage and DAWSON_STAGE but they have different values.');
  process.exit(1);
}

if (!argv.stage) {
  error('Missing Configuration: we could determine which stage to deploy to, please use the --stage argument or set DAWSON_STAGE.');
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

log('');
log('   dawson'.bold.blue, 'v' + pkg.version);
log('  ', PKG_JSON.name.yellow.dim.bold, '↣', AWS.config.region.yellow.dim.bold, '↣', argv.stage.yellow.bold);
log('');
