
import { stripIndent, oneLine } from 'common-tags';
import AWS from 'aws-sdk';
import execa from 'execa';
import Listr from 'listr';
import verboseRenderer from 'listr-verbose-renderer';
import chalk from 'chalk';

import { RESERVED_FUCTION_NAMES, SETTINGS, API_DEFINITIONS, APP_NAME, getCloudFrontSettings, getHostedZoneId } from '../config';
const { cloudfront: cloudfrontStagesSettings } = SETTINGS;

import { debug, danger, warning, success } from '../logger';
import taskCreateBundle from '../libs/createBundle';

import {
  templateStackName,
  buildStack,
  restoreStackPolicy,
  removeStackPolicy,
  createOrUpdateStack,
  observerForUpdateCompleted,
  getStackOutputs,
  AWS_REGION
} from '../factories/cf_utils';

import {
  createSupportResources
} from '../factories/cf_support';

import {
  templateRest,
  templateResourceHelper,
  templateMethod,
  templateDeployment,
  templateDeploymentName,
  templateStage,
  templateAPIID,
  templateAccount,
  templateCloudWatchRole
} from '../factories/cf_apig';

import {
  templateLambda
} from '../factories/cf_lambda';

import {
  templateCWEventRule
} from '../factories/cf_cloudwatch';

import {
  templateAssetsBucket,
  templateAssetsBucketName
} from '../factories/cf_s3';

import {
  templateCloudfrontDistribution,
  templateCloudfrontDistributionName
} from '../factories/cf_cloudfront';

import {
  templateRoute53
} from '../factories/cf_route53';

async function taskUpdateSupportStack ({ appStage, supportStackName }) {
  await createSupportResources({ stackName: supportStackName, cloudfrontStagesSettings });
  const supportOutputs = await getStackOutputs({ stackName: supportStackName });
  const supportBucketName = supportOutputs.find(o => o.OutputKey === 'SupportBucket').OutputValue;
  return { supportBucketName };
}

async function createACMCert ({ cloudfrontSettings }) {
  const domainName = cloudfrontSettings;
  const acm = new AWS.ACM({ region: 'us-east-1' });
  const requestResult = await acm.requestCertificate({
    DomainName: domainName,
    IdempotencyToken: `dawson-${domainName}`.replace(/\W+/g, '')
  }).promise();
  const certificateArn = requestResult.CertificateArn;
  warning(oneLine`
    An SSL/TLS certificate has been requested for the domain ${domainName.bold} (${certificateArn}).
    Dawson will now exit; please run this command again when you've validated such certificate.
    Domain contacts and administrative emails will receive an email asking for confirmation.
    Refer to AWS ACM documentation for further info:
    https://docs.aws.amazon.com/acm/latest/userguide/setup-email.html
  `);
  process.exit(1);
}

async function taskRequestACMCert ({ cloudfrontSettings }) {
  if (typeof cloudfrontSettings !== 'string') {
    return {};
  }
  const acm = new AWS.ACM({ region: 'us-east-1' });
  const certListResult = await acm.listCertificates({
    CertificateStatuses: ['ISSUED']
  }).promise();

  const arns = certListResult.CertificateSummaryList.map(c => c.CertificateArn);
  debug('current ACM Certificates', arns);

  let usableCertArn = null;
  for (const arn of arns) {
    const describeResult = await acm.describeCertificate({
      CertificateArn: arn
    }).promise();
    const domains = [
      describeResult.Certificate.DomainName,
      ...describeResult.Certificate.SubjectAlternativeNames
    ];
    if (domains.includes(cloudfrontSettings)) {
      usableCertArn = arn;
    }
  }

  if (usableCertArn) {
    debug(`using certificate: ${usableCertArn}`);
    return {
      acmCertificateArn: usableCertArn
    };
  } else {
    const newCertArn = await createACMCert({ cloudfrontSettings });
    return {
      acmCertificateArn: newCertArn
    };
  }
}

function taskUploadZip ({ supportBucketName, appStage, stackName }, ctx) {
  return taskCreateBundle({
    bucketName: supportBucketName,
    appStageName: appStage,
    excludeList: SETTINGS.ignore,
    stackName
  }, ctx);
}

function taskCreateFunctionTemplatePartial ({ index, def, stackName, zipS3Location }) {
  if (typeof def.api !== 'object') {
    throw new Error(`You must specify an 'api' property for '${def.name}' function`);
  }

  const {
    path: resourcePath = false,
    method: httpMethod = 'GET',
    policyStatements: policyStatements = [],
    responseContentType = 'text/html',
    runtime,
    keepWarm = false,
    authorizer,
    redirects = false
  } = def.api;
  const name = def.name;

  debug(`=> #${index} Found function ${name.bold} at ${httpMethod.bold} /${resourcePath.bold}`);

  const authorizerFunctionName = authorizer ? authorizer.name : null;
  if (authorizerFunctionName) {
    if (typeof API_DEFINITIONS[authorizerFunctionName] !== 'function') {
      throw new Error(`The authorizer function '${authorizerFunctionName}' must also be exported`);
    }
    if (!API_DEFINITIONS[authorizerFunctionName].api || !API_DEFINITIONS[authorizerFunctionName].api.isEventHandler) {
      throw new Error(`The authorizer function '${authorizerFunctionName}' must have api.isEventHandler set to true`);
    }
  }

  let template = {};
  let methodDefinition = null;

  const lambdaName = def.name[0].toUpperCase() + def.name.substring(1);
  const lambdaPartial = templateLambda({
    lambdaName,
    handlerFunctionName: def.name,
    zipS3Location,
    policyStatements,
    runtime,
    keepWarm
  });

  if (resourcePath === false) {
    template = {
      ...template,
      ...lambdaPartial
    };
  } else {
    const {
      resourceName,
      templateResourcePartial
    } = templateResourceHelper({
      resourcePath
    });
    template = {
      ...template,
      ...templateResourcePartial,
      ...lambdaPartial,
      ...templateMethod({
        resourceName,
        httpMethod,
        lambdaName,
        responseContentType,
        authorizerFunctionName,
        redirects
      })
    };
    methodDefinition = { resourceName, httpMethod };
  }

  if (keepWarm === true) {
    template = {
      ...template,
      ...templateCWEventRule({
        lambdaName
      })
    };
  }

  return { template, methodDefinition };
}

function taskCreateCloudFrontTemplate ({ stageName, cloudfrontSettings, acmCertificateArn, skipAcmCertificate }) {
  const cloudfrontCustomDomain = typeof cloudfrontSettings === 'string' ? cloudfrontSettings : null;
  if (skipAcmCertificate === true) {
    debug(`Skipping ACM SSL/TLS Certificate validation`);
  }
  const cloudfrontPartial = (cloudfrontSettings !== false)
    ? templateCloudfrontDistribution({
      stageName,
      alias: cloudfrontCustomDomain,
      acmCertificateArn,
      skipAcmCertificate
    })
    : {};
  return { cloudfrontCustomDomain, cloudfrontPartial };
}

function taskCreateRoute53Template ({ cloudfrontCustomDomain, hostedZoneId }) {
  const route53Enabled = (cloudfrontCustomDomain && hostedZoneId);
  const route53Partial = route53Enabled ? templateRoute53({ hostedZoneId, cloudfrontCustomDomain }) : {};
  return { route53Enabled, route53Partial };
}

async function taskCheckRoute53Prerequisites ({ route53Enabled, hostedZoneId, cloudfrontCustomDomain }) {
  if (route53Enabled) {
    const r53 = new AWS.Route53({});
    const zoneInfo = await r53.getHostedZone({ Id: hostedZoneId }).promise();
    const domainName = zoneInfo.HostedZone.Name;
    if (!`${cloudfrontCustomDomain}.`.includes(domainName) &&
         domainName !== `${cloudfrontCustomDomain}.`) {
      throw new Error(stripIndent`
        Route53 Zone '${hostedZoneId}' (${domainName}) cannot 
        contain this record: '${cloudfrontCustomDomain}.', please fix your package.json.
      `);
    }
  }
}

function taskProcessTemplate ({ appStage, stageName, cloudfrontPartial, route53Partial, cloudfrontSettings, functionTemplatePartials, methodsInTemplate }) {
  const deploymentUid = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let cfTemplate = {
    Parameters: {
      DawsonStage: {
        Type: 'String',
        Default: appStage
      }
    },
    Resources: {
      ...templateAssetsBucket(),
      ...templateRest({ appStage }),
      ...functionTemplatePartials,
      ...templateDeployment({
        deploymentUid,
        dependsOnMethods: methodsInTemplate
      }),
      ...cloudfrontPartial,
      ...route53Partial
    },
    Outputs: {
      ApiGatewayUrl: {
        Value: { 'Fn::Join': ['', [
          'https://', { Ref: `${templateAPIID()}` },
          '.execute-api.', AWS_REGION, '.amazonaws.com', `/${stageName}`
        ]]}
      },
      S3AssetsDNS: {
        Value: { 'Fn::GetAtt': [`${templateAssetsBucketName()}`, 'DomainName'] }
      },
      S3AssetsBucket: {
        Value: { 'Ref': `${templateAssetsBucketName()}` }
      },
      CloudFrontDNS: {
        Value: cloudfrontSettings
                ? { 'Fn::GetAtt': [`${templateCloudfrontDistributionName()}`, 'DomainName'] }
                : 'CloudFront disabled from config'
      },
      RestApiId: {
        Value: { 'Ref': `${templateAPIID()}` }
      },
      DeploymentId: {
        Value: { 'Ref': `${templateDeploymentName({ deploymentUid })}` }
      }
    }
  };

  if (typeof API_DEFINITIONS.processCFTemplate === 'function') {
    cfTemplate = API_DEFINITIONS.processCFTemplate(cfTemplate, { deploymentLogicalName: `${templateDeploymentName({ deploymentUid })}` });
  }

  const stageVariables = {};
  Object.keys(cfTemplate.Outputs).forEach(outputName => {
    stageVariables[outputName] = {
      'Fn::Base64': cfTemplate.Outputs[outputName].Value
    };
  });

  cfTemplate.Resources = {
    ...cfTemplate.Resources,
    ...templateStage({
      stageName,
      deploymentUid,
      stageVariables
    }),
    ...templateCloudWatchRole(),
    ...templateAccount()
  };

  const cfTemplateJSON = JSON.stringify(cfTemplate, null, 2);
  return { cfTemplateJSON };
}

async function taskCreateUploadStackTemplate ({ supportBucketName, stackName, cfTemplateJSON }) {
  const cfParams = await buildStack({ supportBucketName, stackName, cfTemplateJSON });
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
  verbose = false
}) {
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
          cloudfrontSettings: getCloudFrontSettings({ appStage }),
          dangerDeleteResources,
          skipAcmCertificate,
          defs: Object.entries(API_DEFINITIONS),
          hostedZoneId: getHostedZoneId({ appStage }),
          stackName: templateStackName({ appName: APP_NAME, stage: appStage }),
          stageName: 'prod',
          appStage,
          supportStackName: templateStackName({ appName: `${APP_NAME}Support` })
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
              const { supportBucketName } = await taskUpdateSupportStack(ctx);
              Object.assign(ctx, { supportBucketName });
            }
          }
        ], { concurrent: true });
      }
    },
    {
      title: 'creating bundle',
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
          acmCertificateArn,
          cloudfrontSettings,
          defs,
          hostedZoneId,
          skipAcmCertificate,
          stackName,
          stageName,
          supportBucketName,
          zipS3Location
        } = ctx;
        const methodsInTemplate = []; // used by DependsOn to prevent APIG to abort deployment because "API contains no methods"
        let functionTemplatePartials = {};

        for (const [index, def] of defs) {
          if (RESERVED_FUCTION_NAMES.includes(def.name)) {
            continue;
          }
          const { template, methodDefinition } = taskCreateFunctionTemplatePartial({ index, def, stackName, zipS3Location });
          functionTemplatePartials = {
            ...functionTemplatePartials,
            ...template
          };
          if (methodDefinition) {
            methodsInTemplate.push(methodDefinition);
          }
        }

        const { cloudfrontCustomDomain, cloudfrontPartial } = taskCreateCloudFrontTemplate({ stageName, cloudfrontSettings, acmCertificateArn, skipAcmCertificate });

        const { route53Enabled, route53Partial } = taskCreateRoute53Template({ cloudfrontCustomDomain, hostedZoneId });
        await taskCheckRoute53Prerequisites({ route53Enabled, hostedZoneId, cloudfrontCustomDomain });

        const { cfTemplateJSON } = taskProcessTemplate({
          appStage,
          stageName,
          cloudfrontPartial,
          route53Partial,
          cloudfrontSettings,
          functionTemplatePartials,
          methodsInTemplate
        });

        const { cfParams } = await taskCreateUploadStackTemplate({ supportBucketName, stackName, cfTemplateJSON });

        Object.assign(ctx, { cfParams, cloudfrontCustomDomain });
      }
    },
    {
      title: 'removing stack policy',
      skip: ctx => !ctx.dangerDeleteResources,
      task: async (ctx) => {
        const { dangerDeleteResources, stackName } = ctx;
        await taskRemoveStackPolicy({ dangerDeleteResources, stackName });
      }
    },
    {
      title: 'requesting changeset',
      task: async (ctx) => {
        const { stackName, cfParams } = ctx;
        const updateRequest = await taskRequestStackUpdate({ stackName, cfParams });
        Object.assign(ctx, { stackChangesetEmpty: updateRequest ? (updateRequest.response === false) : false });
      }
    },
    {
      title: 'waiting for stack update to complete',
      skip: ctx => ctx.stackChangesetEmpty === true,
      task: ctx => {
        const { stackName } = ctx;
        return observerForUpdateCompleted({ stackName });
      }
    },
    {
      title: 'setting stack policy',
      skip: ctx => !ctx.dangerDeleteResources,
      task: async (ctx) => {
        const { dangerDeleteResources, stackName } = ctx;
        await taskRestoreStackPolicy({ dangerDeleteResources, stackName });
      }
    },
    {
      title: 'running post-deploy hook',
      skip: () => !SETTINGS['post-deploy'],
      task: () => execa.shell(SETTINGS['post-deploy'])
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
      const cloudfrontDNS = outputs.find(o => o.OutputKey === 'CloudFrontDNS').OutputValue;

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
    verbose: argv.verbose
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
