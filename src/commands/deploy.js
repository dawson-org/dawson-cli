/* eslint no-unused-vars: 2 */

import path from 'path';
import chalk from 'chalk';
import execa from 'execa';
import Listr from 'listr';
import verboseRenderer from 'listr-verbose-renderer';
import { stripIndent } from 'common-tags';
import s3Uploader from 's3-recursive-uploader';

import loadConfig from '../config';
import taskCreateBundle from '../libs/createBundle';
import { debug, danger, success } from '../logger';

import updateSupportStack from '../libs/updateSupportStack';
import taskRequestACMCert from '../libs/aws/acm-request-cert';
import uploadFile from '../libs/aws/s3-upload-template';
import generateTemplate from '../factories/primaryTemplate';
import createOrUpdateStack from '../libs/aws/cfn-create-or-update-stack';
import {
  templateStackName,
  buildCreateStackParams
} from '../factories/cloudformation';
import { observerForUpdateCompleted } from '../libs/aws/cfn-update-observer';
import {
  removeStackPolicy,
  restoreStackPolicy
} from '../libs/aws/cfn-stack-policy-helpers';
import {
  getStackOutputs,
  getStackResources
} from '../libs/aws/cfn-get-stack-info-helpers';

function taskUploadZip (
  { supportBucketName, appStage, stackName, ignore, skipChmod },
  ctx
) {
  return taskCreateBundle(
    {
      bucketName: supportBucketName,
      appStageName: appStage,
      excludeList: ignore,
      stackName,
      skipChmod
    },
    ctx
  );
}

async function taskCreateUploadStackTemplate (
  { supportBucketName, stackName, cfTemplateJSON }
) {
  const templateURL = await uploadFile({
    bucketName: supportBucketName,
    stackBody: cfTemplateJSON
  });
  const cfParams = buildCreateStackParams({
    stackName,
    templateURL,
    inline: false
  });
  return { cfParams };
}

async function taskRemoveStackPolicy ({ dangerDeleteResources, stackName }) {
  if (dangerDeleteResources === true) {
    await removeStackPolicy({ stackName });
  }
}

function taskRequestStackUpdate ({ stackName, cfParams }) {
  return createOrUpdateStack({ stackName, cfParams, dryrun: false });
}

async function taskRestoreStackPolicy ({ dangerDeleteResources, stackName }) {
  if (dangerDeleteResources === true) {
    await restoreStackPolicy({ stackName });
    debug(`Stack policy was restored to a safe state.`);
  }
}

export async function deploy (args) {
  if (args.dangerDeleteResources) {
    danger(
      stripIndent`
      \n
      DANGER: You have used the '--danger-delete-resources' flag so, as part of this stack update
      your DynamoDB Tables and/or S3 Buckets may be deleted, including all of its content.
      \n
    `
    );
  }

  const tasks = new Listr(
    [
      {
        title: 'validating configuration',
        task: ctx => {
          const {
            API_DEFINITIONS,
            APP_NAME,
            getCloudFrontSettings,
            getHostedZoneId,
            PROJECT_ROOT,
            SETTINGS
          } = loadConfig();

          const {
            appStage,
            dangerDeleteResources = false,
            skipAcmCertificate = false,
            skipChmod = false,
            skipCloudformation = false
          } = args;

          const assetsDir = typeof SETTINGS.assetsDir === 'undefined'
            ? 'assets'
            : SETTINGS.assetsDir;
          const cloudfrontSettings = getCloudFrontSettings({ appStage });
          const cloudfrontStagesMap = SETTINGS.cloudfront;
          const deploymentUid = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
          const hooks = {
            preDeploy: SETTINGS['pre-deploy'],
            postDeploy: SETTINGS['post-deploy']
          };
          const hostedZoneId = getHostedZoneId({ appStage });
          const root = SETTINGS.root || 'api';
          const stackName = templateStackName({
            appName: APP_NAME,
            stage: appStage
          });

          Object.assign(ctx, {
            API_DEFINITIONS,
            appName: APP_NAME,
            appStage,
            assetsDir,
            cloudfrontConfigMap: cloudfrontStagesMap,
            cloudfrontSettings,
            dangerDeleteResources,
            deploymentUid,
            hooks,
            hostedZoneId,
            ignore: SETTINGS.ignore,
            root: root,
            rootDir: PROJECT_ROOT,
            skipAcmCertificate,
            skipChmod,
            skipCloudformation,
            stackName,
            stageName: 'prod'
          });
        }
      },
      {
        title: 'running pre-deploy hook',
        skip: ctx => !ctx.hooks.preDeploy,
        task: ctx => execa.shell(ctx.hooks.preDeploy)
      },
      {
        title: 'checking prerequisites',
        task: ctx => {
          return new Listr(
            [
              {
                title: 'validating ACM SSL/TLS Certificate',
                skip: ({ cloudfrontSettings, skipAcmCertificate }) =>
                  typeof cloudfrontSettings !== 'string' ||
                  skipAcmCertificate === true,
                task: async prereqCtx => {
                  const { acmCertificateArn } = await taskRequestACMCert(
                    prereqCtx
                  );
                  Object.assign(prereqCtx, { acmCertificateArn });
                }
              },
              {
                title: 'updating support stack',
                task: async prereqCtx => {
                  const { supportBucketName } = await updateSupportStack(
                    prereqCtx
                  );
                  Object.assign(prereqCtx, { supportBucketName });
                }
              }
            ],
            { concurrent: true }
          );
        }
      },
      {
        title: 'creating bundle',
        skip: ctx => ctx.skipCloudformation,
        task: ctx => {
          return taskUploadZip(
            {
              ...ctx
            },
            ctx
          );
        }
      },
      {
        title: 'generating template',
        task: async ctx => {
          const {
            supportBucketName,
            stackName,
            cfTemplateJSON
          } = generateTemplate(ctx);
          const {
            cfParams,
            cloudfrontCustomDomain
          } = await taskCreateUploadStackTemplate({
              supportBucketName,
              stackName,
              cfTemplateJSON
            });
          debug('Stack update parameters', cfParams);
          Object.assign(ctx, { cfParams, cloudfrontCustomDomain });
        }
      },
      {
        title: 'removing stack policy',
        skip: ctx => ctx.skipCloudformation || !ctx.dangerDeleteResources,
        task: async ctx => {
          const { dangerDeleteResources, stackName } = ctx;
          await taskRemoveStackPolicy({ dangerDeleteResources, stackName });
        }
      },
      {
        title: 'requesting changeset',
        skip: ctx => ctx.skipCloudformation,
        task: async ctx => {
          const { stackName, cfParams } = ctx;
          const updateRequest = await taskRequestStackUpdate({
            stackName,
            cfParams
          });
          Object.assign(ctx, {
            stackChangesetEmpty: updateRequest
              ? updateRequest.response === false
              : false
          });
        }
      },
      {
        title: 'waiting for stack update to complete',
        skip: ctx => ctx.skipCloudformation || ctx.stackChangesetEmpty === true,
        task: ctx => {
          const { stackName } = ctx;
          return observerForUpdateCompleted({ stackName });
        }
      },
      {
        title: 'setting stack policy',
        skip: ctx => ctx.skipCloudformation || !ctx.dangerDeleteResources,
        task: async ctx => {
          const { dangerDeleteResources, stackName } = ctx;
          await taskRestoreStackPolicy({ dangerDeleteResources, stackName });
        }
      },
      {
        title: 'running post-deploy hook',
        skip: ctx => !ctx.hooks.postDeploy,
        task: ctx => execa.shell(ctx.hooks.postDeploy)
      },
      {
        title: 'uploading assets',
        skip: ctx => !ctx.assetsDir,
        task: async ctx => {
          const resources = await getStackResources({
            stackName: ctx.stackName
          });
          const assetsBucket = resources.find(
            o => o.LogicalResourceId === 'BucketAssets'
          ).PhysicalResourceId;
          const destinationSuffix = ctx.root === 'api' ? '/assets/' : '';
          await s3Uploader({
            source: path.resolve(`${ctx.rootDir}/${ctx.assetsDir}`),
            destination: `${assetsBucket}${destinationSuffix}`
          });
        }
      }
    ],
    {
      renderer: args.verbose ? verboseRenderer : undefined
    }
  );

  return tasks
    .run()
    .then(async ctx => {
      const { stackName, cloudfrontSettings, cloudfrontCustomDomain } = ctx;

      success('');

      if (cloudfrontSettings) {
        const outputs = await getStackOutputs({ stackName });
        const cloudfrontDNS = outputs.find(
          o => o.OutputKey === 'DistributionWWW'
        ).OutputValue;

        if (cloudfrontCustomDomain) {
          success(`   DNS: ${cloudfrontCustomDomain} CNAME ${cloudfrontDNS}`);
          success(`   URL: https://${cloudfrontCustomDomain}`);
          success(`   URL: https://${cloudfrontDNS}`);
        } else {
          success(`   URL: https://${cloudfrontDNS}`);
        }
      } else {
        success(`   Deploy completed!`);
      }
    })
    .catch(e => {
      throw e;
    });
}

export function run (argv) {
  deploy({
    dangerDeleteResources: argv['danger-delete-resources'],
    skipAcmCertificate: argv['skip-acm'],
    appStage: argv.stage,
    verbose: argv.verbose,
    skipChmod: argv['skip-chmod'],
    skipCloudformation: argv['skip-cloudformation']
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
    })
    .then(() => {
      process.exit(0);
    });
}
