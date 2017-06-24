export function templateSupportBucketName () {
  return `BucketSupport`;
}

export function templateSupportStack () {
  return {
    Resources: {
      [`${templateSupportBucketName()}`]: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          LifecycleConfiguration: {
            Rules: [
              {
                Id: 'CleanupAfter7Days',
                ExpirationInDays: 7,
                Status: 'Enabled'
              }
            ]
          },
          VersioningConfiguration: { Status: 'Enabled' }
        }
      }
    },
    Outputs: {
      SupportBucket: { Value: { Ref: `${templateSupportBucketName()}` } }
    }
  };
}
