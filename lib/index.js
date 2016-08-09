#!env babel-node

import yargs from 'yargs';

import { enableDebug } from './logger';
import { run as deployRun } from './deploy';
import { run as assetsUploadRun } from './deploy-assets';
import { run as logRun } from './log';
import { run as describeRun } from './describe';
import { run as proxyRun } from './proxy';

const argv = yargs
  .usage('$0 <command> [command-options]')
  .command('deploy', 'Deploy your app or a single function', () =>
    yargs
      .describe('function-name', 'Only deploy the specified function(s) (regexp). If not specified, deploys all the functions.')
      .alias('f', 'function-name')
      .boolean('quick')
      .default('quick', false)
      .describe('quick', 'Do not create/update support resources')
      .alias('k', 'quick')
      .boolean('no-uploads')
      .default('no-uploads', false)
      .describe('no-uploads', 'Do not create/upload lambda zips')
      .alias('U', 'no-uploads')
      .boolean('danger-delete-storage')
      .default('danger-delete-storage', false)
      .describe('danger-delete-storage', 'Allow Tables & Buckets to be deleted/replaced as part of a stack update. YOU WILL LOOSE YOUR DATA!')
      .help()
  , deployRun)

  .command('upload-assets', 'Upload contents of assets/ folder to S3', {}, assetsUploadRun)
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
      .help()
  , logRun)

  .command('describe', 'List stack outputs', () =>
    yargs
      .help()
  , describeRun)

  .command('dev', 'Runs a development server proxying assets and API Gateway', () =>
    yargs
      .describe('proxy-assets-url', 'Serve assets from URL instead of assets/ folder (useful if you use Webpack Dev Server)')
      .describe('assets-pathname', 'Requires --proxy-assets-url. Pathname to match for proxying assets.')
      .describe('port', 'Port to listen on')
      .demand('port')
      .number('port')
      .help()
  , proxyRun)

  .describe('verbose', 'Enable verbose logging')
  .boolean('verbose')
  .alias('v')

  .demand(1)
  .help()
  .argv;

if (argv.verbose === true) {
  enableDebug();
}
