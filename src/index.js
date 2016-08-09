#!env babel-node

import yargs from 'yargs';

import { enableDebug } from './logger';
import { run as deployRun } from './commands/deploy';
import { run as assetsUploadRun } from './commands/deploy-assets';
import { run as logRun } from './commands/log';
import { run as describeRun } from './commands/describe';
import { run as proxyRun } from './commands/proxy';

const argv = yargs
  .usage('$0 <command> [command-options]')
  .command('deploy', 'Deploy your app or a single function', () =>
    yargs
      .describe('function-name', 'Only deploy the specified function(s) (regexp). If not specified, deploys all the functions.')
      .alias('f', 'function-name')
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

  .command('dev', 'Runs a development server proxying assets (from /) and API Gateway (from /prod)', () =>
    yargs
      .describe('proxy-assets-url', 'Serve the root from this url URL (useful if you use Webpack Dev Server)')
      // .describe('assets-pathname', 'Requires --proxy-assets-url. Pathname to match for proxying assets.')
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
