
import { stripIndent } from 'common-tags';
import { execSync } from 'child_process';
import AWS from 'aws-sdk';

import { SETTINGS, API_DEFINITIONS, APP_NAME, getCloudFrontSettings, getHostedZoneId } from '../config';

import { debug, error, log, danger, success } from '../logger';
import compiler from '../libs/compiler';
import { run as logCommand } from './log';

import {
  zipAndUpload,
  listZipVersions
} from '../libs/zipUpload';

import {
  templateStackName,
  buildStack,
  restoreStackPolicy,
  removeStackPolicy,
  createOrUpdateStack,
  waitForUpdateCompleted,
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

const RESERVED_FUCTION_NAMES = ['processCFTemplate'];

function runCommand (description, cmd) {
  if (!cmd) {
    debug(`Hook: ${description} was not specified.`);
    return;
  }
  try {
    debug(`Hook: ${description} > $ ${cmd}`);
    execSync(cmd, {
      cwd: process.env.PWD,
      stdio: 'inherit',
      env: process.env,
      maxBuffer: 1024 * 1024 * 50
    });
    debug(`Hook: ${description} exited with statusCode 0`);
  } catch (e) {
    error(`An error occurred while running ${description}:`);
    error(e.message);
    debug('Error details:', e.message, e.stack);
    process.exit(2);
  }
}

export async function deploy ({
  appStage,
  noUploads = false,
  dangerDeleteResources = false
}, argv) {
  runCommand('pre-deploy hook', SETTINGS['pre-deploy']);
  const cloudfrontSettings = getCloudFrontSettings({ appStage });
  const hostedZoneId = getHostedZoneId({ appStage });
  const stackName = templateStackName({ appName: APP_NAME, stage: appStage });
  const supportStackName = templateStackName({ appName: `${APP_NAME}Support` });
  try {
    // create support stack (e.g.: temp s3 buckets)
    if (!argv.dryrun) {
      log('*'.blue, 'updating support resources...');
      await createSupportResources({ stackName: supportStackName });
    } else {
      log('*'.yellow, 'support resources were not updated because you have launched this command with --dryrun');
    }

    const supportBucketName = (await getStackOutputs({ stackName: supportStackName }))
      .find(o => o.OutputKey === 'SupportBucket').OutputValue;

    const stageName = 'prod';
    const functionsHuman = [];
    const methodsInTemplate = []; // used by DependsOn to prevent APIG to abort deployment because "API contains no methods"
    let templatePartials = {};
    const zipVersionsList = await listZipVersions({ bucketName: supportBucketName });

    const skip = noUploads;
    const defs = Object.entries(API_DEFINITIONS);
    let currentCounter = 0;

    log('*'.blue, `now bundling ${defs.length - 1} functions, please be patient`);
    const indexFileContents = await compiler(API_DEFINITIONS, stackName);
    const zipS3Location = await zipAndUpload({
      bucketName: supportBucketName,
      appStageName: appStage,
      indexFileContents,
      skip,
      excludeList: SETTINGS.zipIgnore,
      zipVersionsList
    });

    log('*'.blue, `building CloudFormation template...`);
    for (const [index, def] of defs) {
      if (RESERVED_FUCTION_NAMES.includes(def.name)) {
        continue;
      }
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
        authorizer
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
      currentCounter = currentCounter + 1;
      functionsHuman.push({
        name,
        httpMethod,
        resourcePath
      });
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
        templatePartials = {
          ...templatePartials,
          ...lambdaPartial
        };
      } else {
        const {
          resourceName,
          templateResourcePartial
        } = templateResourceHelper({
          resourcePath
        });
        templatePartials = {
          ...templatePartials,
          ...templateResourcePartial,
          ...lambdaPartial,
          ...templateMethod({
            resourceName,
            httpMethod,
            lambdaName,
            responseContentType,
            authorizerFunctionName
          })
        };
        methodsInTemplate.push({ resourceName, httpMethod });
      }
      if (keepWarm === true) {
        templatePartials = {
          ...templatePartials,
          ...templateCWEventRule({
            lambdaName
          })
        };
      }
    }

    log('');

    const cloudfrontCustomDomain = typeof cloudfrontSettings === 'string' ? cloudfrontSettings : null;
    const cloudfrontPartial = (cloudfrontSettings !== false)
      ? templateCloudfrontDistribution({
        stageName,
        alias: cloudfrontCustomDomain
      })
      : {};

    const route53Enabled = (cloudfrontCustomDomain && hostedZoneId);
    const route53Partial = route53Enabled ? templateRoute53({ hostedZoneId, cloudfrontCustomDomain }) : {};

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
        ...templatePartials,
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
    const cfParams = await buildStack({ supportBucketName, stackName, cfTemplateJSON });
    if (dangerDeleteResources === true) {
      danger(stripIndent`
        DANGER: You have used the '--danger-delete-storage' so, as part of this stack update
        your DynamoDB Tables and/or S3 Buckets may be deleted, including all of its content.`);
      await removeStackPolicy({ stackName });
    }

    await createOrUpdateStack({ stackName, cfParams, dryrun: argv.dryrun });

    if (!argv.dryrun) {
      log('*'.blue, 'waiting for stack update to complete...');
      await waitForUpdateCompleted({ stackName });
      success('*'.blue, 'deploy completed!\n');
    } else {
      log('*'.yellow, 'nothing has been deployed because you have launched this command with --dryrun');
    }

    log('');
    runCommand('post-deploy hook', SETTINGS['post-deploy']);

    if (cloudfrontSettings) {
      const outputs = await getStackOutputs({ stackName });
      const cloudfrontDNS = outputs.find(o => o.OutputKey === 'CloudFrontDNS').OutputValue;

      if (cloudfrontCustomDomain) {
        success('*'.blue, `Now configure your DNS: ${cloudfrontCustomDomain} CNAME ${cloudfrontDNS}`);
        success('*'.blue, `and navigate to http://${cloudfrontCustomDomain} or https://${cloudfrontDNS}`);
      } else {
        success('*'.blue, `Open your browser and enjoy: https://${cloudfrontDNS}`);
      }
    }

    if (!argv.dryrun && argv.functionName) {
      // we may want to tail logs for one function
      return logCommand({ ...argv, follow: true });
    }
  } catch (e) {
    error('An error occurred while deploying your application:');
    error('> ', e.message);
    error('Re-run this command with --verbose to debug.');
    debug('Stack trace:', e.stack);
  } finally {
    if (dangerDeleteResources === true) {
      await restoreStackPolicy({ stackName });
      debug(`Stack policy was restored to a safe state.`);
    }
  }
}

export function run (argv) {
  deploy({
    noUploads: argv['no-uploads'],
    dangerDeleteResources: argv['danger-delete-resources'],
    appStage: argv.stage
  }, argv)
  .catch(error => error('Uncaught error', error.message, error.stack))
  .then(() => {});
}
