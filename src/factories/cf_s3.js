export function templateAssetsBucketName () {
  return `BucketAssets`;
}

export function templateAssetsBucket () {
  return {
    [`${templateAssetsBucketName()}`]: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        WebsiteConfiguration: {
          ErrorDocument: 'index.html',
          IndexDocument: 'index.html'
        }
      }
    },
    [`${templateAssetsBucketName()}Policy`]: {
      Type: 'AWS::S3::BucketPolicy',
      Properties: {
        Bucket: { Ref: `${templateAssetsBucketName()}` },
        PolicyDocument: {
          Statement: [
            {
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:s3:::',
                    { Ref: `${templateAssetsBucketName()}` },
                    '/*'
                  ]
                ]
              },
              Principal: '*'
            }
          ]
        }
      }
    }
  };
}
