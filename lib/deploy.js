
// Build a cloudformation template and deploy
//

import { SETTINGS, API_DEFINITIONS } from './config';
const { appName } = SETTINGS;

import { stripIndent } from 'common-tags';

import { debug, error, log, table, danger, success, title } from './logger';
import compiler from './compiler';

import {
  templateStackName,
  buildStackParams,
  restoreStackPolicy,
  removeStackPolicy,
  createOrUpdateStack,
  waitForUpdateCompleted,
  AWS_REGION
} from './cf_utils';

import {
  createSupportResources
} from './cf_support';

import {
  templateRest,
  templateResourceHelper,
  templateMethod,
  templateDeployment,
  templateDeploymentName,
  templateStage,
  templateAPIID
} from './cf_apig';

import {
  templateLambda
} from './cf_lambda';

import {
  zipAndUpload,
  listZipVersions
} from './zipUpload';

import {
  templateAssetsBucket,
  templateAssetsBucketName
} from './cf_s3';

import {
  templateCloudfrontDistribution,
  templateCloudfrontDistributionName
} from './cf_cloudfront';

import { stackUpload } from './stackUpload';

const RESERVED_FUCTION_NAMES = ['processCFTemplate'];

export async function deploy ({
  functionFilterRE,
  quick = false,
  noUploads = false,
  dangerDeleteStorage = false
}) {
  const stackName = templateStackName({ appName });
  try {
    if (!quick) {
      // create support stack (e.g.: temp s3 buckets)
      log('updating support resources...');
      await createSupportResources({ appName });
    }

    const stageName = 'prod';
    const functionsHuman = [];
    let lastMethodInTemplate = null; // used by DependsOn to prevent APIG to abort deployment because "API contains no methods"
    let templatePartials = {};
    const zipVersionsList = await listZipVersions({ appName });

    const defs = Object.entries(API_DEFINITIONS);
    log(`zipping and uploading ${defs.length} functions...`);

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
      debug(`=> #${index} Found function ${name.bold} at ${httpMethod.bold} /${resourcePath.bold}`,
        `${skip ? '* skipped' : ''}`);
      functionsHuman.push({
        name,
        httpMethod,
        resourcePath
      });
      const indexFileContents = await compiler(name, def.api);
      const zipS3Location = await zipAndUpload({
        appName,
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
        appName,
        resourcePath
      });
      templatePartials = {
        ...templatePartials,
        ...templateResourcePartial,
        ...lambdaPartial,
        ...templateMethod({
          appName,
          resourceName,
          httpMethod,
          lambdaName,
          responseContentType
        })
      };
      lastMethodInTemplate = { resourceName, httpMethod };
    }

    const deploymentUid = `${Math.floor(Math.random() * 100000)}`;
    let cfInnerTemplate = {
      Resources: {
        ...templateAssetsBucket({ appName }),
        ...templateRest({ appName }),
        ...templatePartials,
        ...templateDeployment({
          appName,
          deploymentUid,
          dependsOnMethod: lastMethodInTemplate
        }),
        ...templateCloudfrontDistribution({
          appName,
          stageName
        })
      },
      Outputs: {
        ApiGatewayUrl: {
          Value: { 'Fn::Join': ['', [
            'https://', { Ref: `${templateAPIID({ appName })}` },
            '.execute-api.', AWS_REGION, '.amazonaws.com', `/${stageName}`
          ]]}
        },
        S3AssetsDNS: {
          Value: { 'Fn::GetAtt': [`${templateAssetsBucketName({ appName })}`, 'DomainName'] }
        },
        S3AssetsBucket: {
          Value: { 'Ref': `${templateAssetsBucketName({ appName })}` }
        },
        CloudFrontDNS: {
          Value: (SETTINGS.cloudfront === false)
                  ? 'CloudFront disabled from config'
                  : { 'Fn::GetAtt': [`${templateCloudfrontDistributionName({ appName })}`, 'DomainName'] }
        },
        RestApiId: {
          Value: { 'Ref': `${templateAPIID({ appName })}` }
        },
        DeploymentId: {
          Value: { 'Ref': `${templateDeploymentName({ deploymentUid })}` }
        }
      }
    };
    if (typeof API_DEFINITIONS.processCFTemplate === 'function') {
      cfInnerTemplate = API_DEFINITIONS.processCFTemplate(cfInnerTemplate);
    }
    const cfInnerTemplateJSON = JSON.stringify(cfInnerTemplate, null, 2);
    const nestedTemplateUrl = await stackUpload({ appName, stackBody: cfInnerTemplateJSON });
    debug('Inner template:', nestedTemplateUrl);

    const finalOutputs = {};
    const stageVariables = {};
    Object.keys(cfInnerTemplate.Outputs).forEach(outputName => {
      finalOutputs[outputName] = {
        Value: { 'Fn::GetAtt': ['InnerStack', `Outputs.${outputName}`] }
      };
      stageVariables[outputName] = {
        'Fn::Base64': { 'Fn::GetAtt': ['InnerStack', `Outputs.${outputName}`] }
      };
    });

    const cfTemplate = {
      'Resources': {
        InnerStack: {
          'Type': 'AWS::CloudFormation::Stack',
          'Properties': {
            'TemplateURL': nestedTemplateUrl
          }
        },
        ...templateStage({
          appName,
          stageName,
          deploymentUid,
          stageVariables
        })
      },
      'Outputs': finalOutputs
    };
    const cfTemplateJSON = JSON.stringify(cfTemplate, null, 2);

    const cfParams = buildStackParams({ stackName, cfTemplateJSON });
    if (dangerDeleteStorage === true) {
      danger(stripIndent`
        DANGER: You have used the '--danger-delete-storage' so, as part of this stack update
        your DynamoDB Tables and/or S3 Buckets may be deleted, including all of its content.`);
      await removeStackPolicy({ stackName });
    }

    log('Updating stack...');
    await createOrUpdateStack({ stackName, cfParams });
    debug('Waiting for stack update to complete...');

    const outputs = await waitForUpdateCompleted({ stackName });
    const s3AssetsDNS = outputs.find(o => o.OutputKey === 'S3AssetsDNS').OutputValue;
    const cloudfrontDNS = outputs.find(o => o.OutputKey === 'CloudFrontDNS').OutputValue;
    const apiPrefix = outputs.find(o => o.OutputKey === 'ApiGatewayUrl').OutputValue;
    const functionsTable = functionsHuman.map(f => ({
      ...f,
      resourcePath: `${apiPrefix}/${f.resourcePath}`
    }));
    success('Deploy completed!');
    title('\nHere are your updated endpoints:'.bold);
    table(functionsTable);
    log('Your static assets endpoint is:'.bold);
    log(`https://${s3AssetsDNS}`);
    log('');
    log('Your public endpoint is:'.bold);
    log(`https://${cloudfrontDNS}`);
    log('Assets are served from the assets/ subfolder; other requests are forwarded to the API.');
    log('');
  } catch (e) {
    error('Error', e.message);
    debug('Stack trace:', e.stack);
  } finally {
    if (dangerDeleteStorage === true) {
      await restoreStackPolicy({ stackName });
      log(`Stack policy was restored to a safe state.`);
    }
  }
}

export function run (argv) {
  deploy({
    functionFilterRE: argv['function-name'],
    quick: argv.quick,
    noUploads: argv['no-uploads'],
    dangerDeleteStorage: argv['danger-delete-storage']
  })
  .catch(error => error('Uncaught error', error.message, error.stack))
  .then(() => process.exit(0));
}
