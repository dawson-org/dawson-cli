import AWS from 'aws-sdk';
import { debug, warning } from '../../logger';
import { oneLine } from 'common-tags';

async function awsRequestCertificate ({ cloudfrontSettings }) {
  const domainName = cloudfrontSettings;
  const acm = new AWS.ACM({ region: 'us-east-1' });
  const requestResult = await acm
    .requestCertificate({
      DomainName: domainName,
      IdempotencyToken: `dawson-${domainName}`.replace(/\W+/g, '')
    })
    .promise();
  const certificateArn = requestResult.CertificateArn;
  warning(
    oneLine`
    An SSL/TLS certificate has been requested for the domain ${domainName.bold} (${certificateArn}).
    Dawson will now exit; please run this command again when you've validated such certificate.
    Domain contacts and administrative emails will receive an email asking for confirmation.
    Refer to AWS ACM documentation for further info:
    https://docs.aws.amazon.com/acm/latest/userguide/setup-email.html
  `
  );
  process.exit(1);
}

export default (async function taskRequestACMCert ({ cloudfrontSettings }) {
  if (typeof cloudfrontSettings !== 'string') {
    return {};
  }
  const acm = new AWS.ACM({ region: 'us-east-1' });
  const certListResult = await acm
    .listCertificates({ CertificateStatuses: ['ISSUED'] })
    .promise();

  const arns = certListResult.CertificateSummaryList.map(c => c.CertificateArn);
  debug('current ACM Certificates', arns);

  let usableCertArn = null;
  for (const arn of arns) {
    const describeResult = await acm
      .describeCertificate({ CertificateArn: arn })
      .promise();
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
    return { acmCertificateArn: usableCertArn };
  } else {
    const newCertArn = await awsRequestCertificate({ cloudfrontSettings });
    return { acmCertificateArn: newCertArn };
  }
});
