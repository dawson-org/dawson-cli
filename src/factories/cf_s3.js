
export function templateAssetsBucketName () {
  return `BucketAssets`;
}

export function templateAssetsBucket () {
  return {
    [`${templateAssetsBucketName()}`]: {
      'Type': 'AWS::S3::Bucket',
      'Properties': {
        'WebsiteConfiguration': {
          'ErrorDocument': 'index.html',
          'IndexDocument': 'index.html'
        }
      }
    }
  };
}
