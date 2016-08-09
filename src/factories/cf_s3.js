
export function templateAssetsBucketName ({ appName }) {
  return `${appName}Assets`;
}

export function templateAssetsBucket ({ appName }) {
  return {
    [`${templateAssetsBucketName({ appName })}`]: {
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
