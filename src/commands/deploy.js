/* eslint no-unused-vars: 2 */

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
import { templateStackName, buildCreateStackParams } from '../factories/cloudformation';
import { observerForUpdateCompleted } from '../libs/aws/cfn-update-observer';
import { removeStackPolicy, restoreStackPolicy } from '../libs/aws/cfn-stack-policy-helpers';
import { getStackOutputs, getStackResources } from '../libs/aws/cfn-get-stack-info-helpers';

function taskUploadZip ({ supportBucketName, appStage, stackName, ignore, skipChmod }, ctx) {
  return taskCreateBundle({
    bucketName: supportBucketName,
    appStageName: appStage,
    excludeList: ignore,
    stackName,
    skipChmod
  }, ctx);
}

async function taskCreateUploadStackTemplate ({ supportBucketName, stackName, cfTemplateJSON }) {
  const templateURL = await uploadFile({
    bucketName: supportBucketName,
    stackBody: cfTemplateJSON
  });
  const cfParams = buildCreateStackParams({ stackName, templateURL, inline: false });
  return { cfParams };
}

async function taskRemoveStackPolicy ({ dangerDeleteResources, stackName }) {
  if (dangerDeleteResources === true) {
    await removeStackPolicy({ stackName });
  }
}

async function taskRequestStackUpdate ({ stackName, cfParams }) {
  return await createOrUpdateStack({ stackName, cfParams, dryrun: false });
}

async function taskRestoreStackPolicy ({ dangerDeleteResources, stackName }) {
  if (dangerDeleteResources === true) {
    await restoreStackPolicy({ stackName });
    debug(`Stack policy was restored to a safe state.`);
  }
}

export async function deploy ({
  appStage,
  dangerDeleteResources = false,
  skipAcmCertificate = false,
  verbose = false,
  skipChmod = false,
  skipCloudformation = false
}) {
  const {
    API_DEFINITIONS,
    SETTINGS,
    APP_NAME,
    PROJECT_ROOT,
    getCloudFrontSettings,
    getHostedZoneId
  } = loadConfig();
  const cloudfrontStagesMap = SETTINGS.cloudfront;
  const root = SETTINGS.root || 'api';

  if (dangerDeleteResources) {
    danger(stripIndent`
      DANGER: You have used the '--danger-delete-resources' so, as part of this stack update
      your DynamoDB Tables and/or S3 Buckets may be deleted, including all of its content.`);
  }

  const tasks = new Listr([
    {
      title: 'running pre-deploy hook',
      skip: () => !SETTINGS['pre-deploy'],
      task: () => execa.shell(SETTINGS['pre-deploy'])
    },
    {
      title: 'validating configuration',
      task: ctx => {
        Object.assign(ctx, {
          API_DEFINITIONS,
          cloudfrontSettings: getCloudFrontSettings({ appStage }),
          dangerDeleteResources,
          skipAcmCertificate,
          hostedZoneId: getHostedZoneId({ appStage }),
          stackName: templateStackName({ appName: APP_NAME, stage: appStage }),
          stageName: 'prod',
          appStage,
          root: root,
          ignore: SETTINGS.ignore,
          cloudfrontConfigMap: cloudfrontStagesMap,
          appName: APP_NAME,
          skipChmod,
          deploymentUid: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
          rootDir: PROJECT_ROOT,
          assetsDir: typeof SETTINGS.assetsDir === 'undefined' ? 'assets' : false
        });
      }
    },
    {
      title: 'checking prerequisites',
      task: (ctx) => {
        return new Listr([
          {
            title: 'validating ACM SSL/TLS Certificate',
            skip: ({ cloudfrontSettings, skipAcmCertificate }) => (typeof cloudfrontSettings !== 'string' || skipAcmCertificate === true),
            task: async (ctx) => {
              const { acmCertificateArn } = await taskRequestACMCert(ctx);
              Object.assign(ctx, { acmCertificateArn });
            }
          },
          {
            title: 'updating support stack',
            task: async (ctx) => {
              const { supportBucketName } = await updateSupportStack(ctx);
              Object.assign(ctx, { supportBucketName });
            }
          }
        ], { concurrent: true });
      }
    },
    {
      title: 'creating bundle',
      skip: () => skipCloudformation,
      task: ctx => {
        return taskUploadZip({
          ...ctx
        }, ctx);
      }
    },
    {
      title: 'generating template',
      task: async (ctx) => {
        const {
          supportBucketName,
          stackName,
          cfTemplateJSON
        } = generateTemplate(ctx);
        const { cfParams, cloudfrontCustomDomain } = await taskCreateUploadStackTemplate({
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
      skip: ctx => skipCloudformation || !ctx.dangerDeleteResources,
      task: async (ctx) => {
        const { dangerDeleteResources, stackName } = ctx;
        await taskRemoveStackPolicy({ dangerDeleteResources, stackName });
      }
    },
    {
      title: 'requesting changeset',
      skip: () => skipCloudformation,
      task: async (ctx) => {
        const { stackName, cfParams } = ctx;
        const updateRequest = await taskRequestStackUpdate({ stackName, cfParams });
        Object.assign(ctx, { stackChangesetEmpty: updateRequest ? (updateRequest.response === false) : false });
      }
    },
    {
      title: 'waiting for stack update to complete',
      skip: ctx => skipCloudformation || ctx.stackChangesetEmpty === true,
      task: ctx => {
        const { stackName } = ctx;
        return observerForUpdateCompleted({ stackName });
      }
    },
    {
      title: 'setting stack policy',
      skip: ctx => skipCloudformation || !ctx.dangerDeleteResources,
      task: async (ctx) => {
        const { dangerDeleteResources, stackName } = ctx;
        await taskRestoreStackPolicy({ dangerDeleteResources, stackName });
      }
    },
    {
      title: 'running post-deploy hook',
      skip: () => !SETTINGS['post-deploy'],
      task: () => execa.shell(SETTINGS['post-deploy'])
    },
    {
      title: 'uploading assets',
      skip: ctx => !ctx.assetsDir,
      task: async ctx => {
        const resources = await getStackResources({ stackName: ctx.stackName });
        const assetsBucket = resources.find(o => o.LogicalResourceId === 'BucketAssets').PhysicalResourceId;
        await s3Uploader({
          source: `${ctx.rootDir}/${ctx.assetsDir}`,
          destination: `${assetsBucket}/assets/`
        });
      }
    }
  ], {
    renderer: verbose ? verboseRenderer : undefined
  });

  return tasks.run()
  .then(async (ctx) => {
    const { stackName, cloudfrontSettings, cloudfrontCustomDomain } = ctx;

    success('');

    if (cloudfrontSettings) {
      const outputs = await getStackOutputs({ stackName });
      const cloudfrontDNS = outputs.find(o => o.OutputKey === 'DistributionWWW').OutputValue;

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
  .catch(e => { throw e; });
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
    console.error(
      chalk.red.bold('dawson internal error:'),
      err.message
    );
    console.error(err.stack);
    console.error(chalk.red(`Please report this bug: https://github.com/dawson-org/dawson-cli/issues`));
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
}
