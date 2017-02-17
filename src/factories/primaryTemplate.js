
import merge from 'lodash/merge';

import { RESERVED_FUCTION_NAMES } from '../config';
import { debug } from '../logger';

import { templateLambda } from '../factories/cf_lambda';
import { templateRoute53 } from '../factories/cf_route53';
import {
  templateAccount,
  templateDeployment,
  templateDeploymentName,
  templateMethod,
  templateResourceHelper,
  templateRest,
  templateStage
} from '../factories/cf_apig';
import {
  templateCloudfrontDistribution,
  templateCloudfrontDistributionName
} from '../factories/cf_cloudfront';
import {
  templateAssetsBucket,
  templateAssetsBucketName
} from '../factories/cf_s3';

const CFN_DAWSON_OUTPUTS = {
  BucketAssets: () => ({ Ref: `${templateAssetsBucketName()}` }),
  DistributionWWW: ({ cloudfrontSettings }) =>
    cloudfrontSettings
      ? {
        'Fn::GetAtt': [
          `${templateCloudfrontDistributionName()}`,
          'DomainName'
        ]
      }
      : 'CloudFront disabled from config'
};

function taskProcessTemplate (
  {
    customTemplateObjects,
    appStage,
    stageName,
    cloudfrontPartial,
    route53Partial,
    cloudfrontSettings,
    functionTemplatePartials,
    methodsInTemplate,
    API_DEFINITIONS,
    deploymentUid
  }
) {
  let cfTemplate = {
    Parameters: { DawsonStage: { Type: 'String', Default: appStage } },
    Resources: {
      ...templateAssetsBucket(),
      ...templateRest({ appStage }),
      ...functionTemplatePartials,
      ...templateDeployment({
        deploymentUid,
        dependsOnMethods: methodsInTemplate,
        date: new Date().toISOString()
      }),
      ...cloudfrontPartial,
      ...route53Partial
    },
    Outputs: {
      BucketAssets: { Value: CFN_DAWSON_OUTPUTS.BucketAssets() },
      DistributionWWW: {
        Value: CFN_DAWSON_OUTPUTS.DistributionWWW({ cloudfrontSettings })
      }
    }
  };

  cfTemplate.Resources = {
    ...cfTemplate.Resources,
    ...templateStage({ stageName, deploymentUid }),
    ...templateAccount()
  };

  cfTemplate = merge(cfTemplate, customTemplateObjects);

  if (typeof API_DEFINITIONS['processCFTemplate'] === 'function') {
    cfTemplate = API_DEFINITIONS['processCFTemplate'](cfTemplate);
  }

  const cfTemplateJSON = JSON.stringify(cfTemplate, null, 2);
  return { cfTemplateJSON, cfTemplate };
}

function taskCreateFunctionTemplatePartial (
  { index, def, stackName, zipS3Location, environment: originalEnvironment }
) {
  if (typeof def.api !== 'object') {
    throw new Error(
      `You must specify an 'api' property for '${def.name}' function`
    );
  }

  const {
    path: resourcePath,
    method: httpMethod = 'GET',
    policyStatements: policyStatements = [],
    responseContentType = 'text/html',
    runtime,
    authorizer,
    redirects = false,
    excludeEnv
  } = def.api;
  const name = def.name;

  // removes env variables excluded by .excludeEnv property
  const environment = { ...originalEnvironment };
  if (excludeEnv) {
    excludeEnv.forEach(key => {
      delete environment[key];
    });
  }

  debug(
    `=> #${index} Found function ${name.bold} at ${httpMethod.bold} /${resourcePath.bold}`
  );

  const authorizerFunctionName = authorizer ? authorizer.name : null;

  let template = {};
  let methodDefinition = null;

  const lambdaName = def.name[0].toUpperCase() + def.name.substring(1);
  const lambdaPartial = templateLambda({
    lambdaName,
    handlerFunctionName: def.name,
    zipS3Location,
    policyStatements,
    runtime,
    environment
  });

  if (resourcePath === false) {
    template = { ...template, ...lambdaPartial };
  } else {
    const { resourceName, templateResourcePartial } = templateResourceHelper({
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

  return { template, methodDefinition };
}

function taskCreateCloudFrontTemplate (
  {
    stageName,
    cloudfrontSettings,
    acmCertificateArn,
    skipAcmCertificate,
    cloudfrontRootOrigin
  }
) {
  const cloudfrontCustomDomain = typeof cloudfrontSettings === 'string'
    ? cloudfrontSettings
    : null;
  debug(`cloudfrontSettings for this stage: ${cloudfrontSettings}`);
  const cloudfrontPartial = cloudfrontSettings !== false
    ? templateCloudfrontDistribution({
      stageName,
      alias: cloudfrontCustomDomain,
      acmCertificateArn,
      skipAcmCertificate,
      cloudfrontRootOrigin
    })
    : {};
  return { cloudfrontCustomDomain, cloudfrontPartial };
}

function taskCreateRoute53Template ({ cloudfrontCustomDomain, hostedZoneId }) {
  const route53Enabled = cloudfrontCustomDomain && hostedZoneId;
  const route53Partial = route53Enabled
    ? templateRoute53({ hostedZoneId, cloudfrontCustomDomain })
    : {};
  return { route53Enabled, route53Partial };
}

// async function taskCheckRoute53Prerequisites (
//   { route53Enabled, hostedZoneId, cloudfrontCustomDomain }
// ) {
//   if (route53Enabled) {
//     const r53 = new AWS.Route53({});
//     const zoneInfo = await r53.getHostedZone({ Id: hostedZoneId }).promise();
//     const domainName = zoneInfo.HostedZone.Name;
//     if (
//       !`${cloudfrontCustomDomain}.`.includes(domainName) &&
//         domainName !== `${cloudfrontCustomDomain}.`
//     ) {
//       throw new Error(
//         stripIndent`
//         Route53 Zone '${hostedZoneId}' (${domainName}) cannot
//         contain this record: '${cloudfrontCustomDomain}.', please fix your package.json.
//       `
//       );
//     }
//   }
// }

export default function generateTemplate (
  {
    acmCertificateArn,
    API_DEFINITIONS,
    appStage,
    cloudfrontRootOrigin,
    cloudfrontSettings,
    hostedZoneId,
    skipAcmCertificate,
    stackName,
    stageName,
    supportBucketName,
    zipS3Location,
    deploymentUid
  }
) {
  const methodsInTemplate = []; // used by DependsOn to prevent APIG to abort deployment because "API contains no methods"
  let functionTemplatePartials = {};

  let customTemplateObjects = {};
  if (typeof API_DEFINITIONS.customTemplateFragment === 'function') {
    customTemplateObjects = API_DEFINITIONS.customTemplateFragment({}, {
      deploymentLogicalName: `${templateDeploymentName({ deploymentUid })}`
    });
  }

  const environment = {};
  Object.keys(customTemplateObjects.Outputs || {}).forEach(outputName => {
    environment[outputName] = customTemplateObjects.Outputs[outputName].Value;
  });
  Object.keys(CFN_DAWSON_OUTPUTS).forEach(outputName => {
    environment[outputName] = CFN_DAWSON_OUTPUTS[outputName]({
      // you should pass settings eventually required by output snippets,
      // currently cloudfrontSettings is used only by DistributionWWW Output
      cloudfrontSettings
    });
  });

  for (const [index, def] of Object.entries(API_DEFINITIONS)) {
    if (RESERVED_FUCTION_NAMES.includes(def.name)) {
      continue;
    }
    const { template, methodDefinition } = taskCreateFunctionTemplatePartial({
      index,
      def,
      stackName,
      zipS3Location,
      environment
    });
    functionTemplatePartials = { ...functionTemplatePartials, ...template };
    if (methodDefinition) {
      methodsInTemplate.push(methodDefinition);
    }
  }

  const {
    cloudfrontCustomDomain,
    cloudfrontPartial
  } = taskCreateCloudFrontTemplate({
    stageName,
    cloudfrontSettings,
    acmCertificateArn,
    skipAcmCertificate,
    cloudfrontRootOrigin
  });

  const { route53Enabled, route53Partial } = taskCreateRoute53Template({ // eslint-disable-line no-unused-vars
    cloudfrontCustomDomain,
    hostedZoneId
  });
  // await taskCheckRoute53Prerequisites({
  //   route53Enabled,
  //   hostedZoneId,
  //   cloudfrontCustomDomain
  // });

  const { cfTemplateJSON, cfTemplate } = taskProcessTemplate({
    customTemplateObjects,
    appStage,
    stageName,
    cloudfrontPartial,
    route53Partial,
    cloudfrontSettings,
    functionTemplatePartials,
    methodsInTemplate,
    API_DEFINITIONS,
    deploymentUid
  });

  return {
    supportBucketName,
    stackName,
    cfTemplateJSON,
    cfTemplate,
    cloudfrontCustomDomain
  };
}
