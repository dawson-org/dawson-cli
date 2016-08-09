
export function templateAssetsBucketName () {
  return `Assets`;
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
