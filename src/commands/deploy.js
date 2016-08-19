
import ProgressBar from 'progress';
import { stripIndent } from 'common-tags';

import { SETTINGS, API_DEFINITIONS } from '../config';
const { appName } = SETTINGS;

import { debug, error, log, table, danger, success, title } from '../logger';
import compiler from '../libs/compiler';

import {
  zipAndUpload,
  listZipVersions
} from '../libs/zipUpload';

import {
  templateStackName,
  buildStackParams,
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
  templateAPIID
} from '../factories/cf_apig';

import {
  templateLambda
} from '../factories/cf_lambda';

import {
  templateAssetsBucket,
  templateAssetsBucketName
} from '../factories/cf_s3';

import {
  templateCloudfrontDistribution,
  templateCloudfrontDistributionName
} from '../factories/cf_cloudfront';

const RESERVED_FUCTION_NAMES = ['processCFTemplate'];

export async function deploy ({
  appStage,
  functionFilterRE,
  noUploads = false,
  dangerDeleteResources = false
}) {
  const stackName = templateStackName({ appName, stage: appStage });
  const supportStackName = templateStackName({ appName: `${appName}Support` });
  try {
    // create support stack (e.g.: temp s3 buckets)
    log('*'.blue, 'updating support resources...');
    await createSupportResources({ stackName: supportStackName });

    const supportBucketName = (await getStackOutputs({ stackName: supportStackName }))
      .find(o => o.OutputKey === 'SupportBucket').OutputValue;

    const stageName = 'prod';
    const functionsHuman = [];
    const methodsInTemplate = []; // used by DependsOn to prevent APIG to abort deployment because "API contains no methods"
    let templatePartials = {};
    const zipVersionsList = await listZipVersions({ bucketName: supportBucketName });

    const defs = Object.entries(API_DEFINITIONS);
    let currentCounter = 0;

    log('*'.blue, `${noUploads ? 'loading' : 'zipping and uploading'} ${defs.length} functions:`);
    const progressBar = new ProgressBar('  [:bar] :elapseds (ETA :etas)', { total: defs.length, width: 20 });

    for (const [index, def] of defs) {
      if (RESERVED_FUCTION_NAMES.includes(def.name)) {
        continue;
      }
      if (typeof def.api !== 'object') {
        throw new Error(`You must specify an 'api' property for '${def.name}' function`);
      }
      const {
        path: resourcePath = null,
        method: httpMethod = 'GET',
        policyStatements: policyStatements = [],
        responseContentType = 'text/html',
        runtime
      } = def.api;
      const name = def.name;
      const skip = !name.match(new RegExp(functionFilterRE)) || noUploads;
      currentCounter = currentCounter + 1;
      progressBar.tick();
      debug(`=> #${index} Found function ${name.bold} at ${httpMethod.bold} /${resourcePath.bold}`,
        `${skip ? '* skipped' : ''}`);
      functionsHuman.push({
        name,
        httpMethod,
        resourcePath
      });
      const indexFileContents = await compiler(name, def.api);
      const zipS3Location = await zipAndUpload({
        bucketName: supportBucketName,
        appStageName: appStage,
        functionName: name,
        indexFileContents,
        skip,
        excludeList: SETTINGS.zipIgnore,
        zipVersionsList
      });
      const lambdaName = def.name[0].toUpperCase() + def.name.substring(1);
      const lambdaPartial = templateLambda({
        lambdaName,
        zipS3Location,
        policyStatements,
        runtime
      });
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
          responseContentType
        })
      };
      methodsInTemplate.push({ resourceName, httpMethod });
    }

    log('');

    const deploymentUid = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    let cfTemplate = {
      Resources: {
        ...templateAssetsBucket(),
        ...templateRest(),
        ...templatePartials,
        ...templateDeployment({
          deploymentUid,
          dependsOnMethods: methodsInTemplate
        }),
        ...templateCloudfrontDistribution({
          stageName
        })
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
          Value: (SETTINGS.cloudfront === false)
                  ? 'CloudFront disabled from config'
                  : { 'Fn::GetAtt': [`${templateCloudfrontDistributionName()}`, 'DomainName'] }
        },
        RestApiId: {
          Value: { 'Ref': `${templateAPIID()}` }
        },
        DeploymentId: {
          Value: { 'Ref': `${templateDeploymentName({ deploymentUid })}` }
        }
      }
    };

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
      })
    };

    if (typeof API_DEFINITIONS.processCFTemplate === 'function') {
      cfTemplate = API_DEFINITIONS.processCFTemplate(cfTemplate);
    }
    const cfTemplateJSON = JSON.stringify(cfTemplate, null, 2);

    const cfParams = buildStackParams({ stackName, cfTemplateJSON });
    if (dangerDeleteResources === true) {
      danger(stripIndent`
        DANGER: You have used the '--danger-delete-storage' so, as part of this stack update
        your DynamoDB Tables and/or S3 Buckets may be deleted, including all of its content.`);
      await removeStackPolicy({ stackName });
    }

    await createOrUpdateStack({ stackName, cfParams });
    log('*'.blue, 'waiting for stack update to complete...');

    const outputs = await waitForUpdateCompleted({ stackName });
    const cloudfrontDNS = outputs.find(o => o.OutputKey === 'CloudFrontDNS').OutputValue;
    const apiPrefix = outputs.find(o => o.OutputKey === 'ApiGatewayUrl').OutputValue;
    const functionsTable = functionsHuman.map(f => ({
      ...f,
      resourcePath: `${apiPrefix}/${f.resourcePath}`
    }));
    success('*'.blue, 'deploy completed!\n');

    title('Your API endpoints are:'.bold);
    table(functionsTable);

    title('Your public endpoint is:');
    if (SETTINGS.cloudfront !== false) {
      log(`https://${cloudfrontDNS}`);
      log(`Make sure to point DNS records for ${SETTINGS.domains.join(', ')} to this distribution.`);
      if (SETTINGS.cloudfrontRootOrigin === 'assets') {
        log('Assets are served from the root; requests starting with prod/ are forwarded to the API.');
      } else {
        log(`The API is served from the root; requests starting with assets/ are served from the assets folder.`);
      }
    } else {
      log('N/A: cloudFront is disabled from package.json settings');
    }

    log('');
  } catch (e) {
    error('An error occurred while deploying your application. Re-run this command with --verbose to debug.');
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
    functionFilterRE: argv['function-name'],
    noUploads: argv['no-uploads'],
    dangerDeleteResources: argv['danger-delete-resources'],
    appStage: argv.stage
  })
  .catch(error => error('Uncaught error', error.message, error.stack))
  .then(() => process.exit(0));
}
