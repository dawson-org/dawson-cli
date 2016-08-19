
# CLI Reference

You must export your [AWS credentials or a profile](https://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) with proper [permissions](#user-permissions):

```bash
# 1. credentials
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
# or: export AWS_PROFILE=...
# 2. the region to deploy to
export AWS_DEFAULT_REGION=eu-west-1
```

Then:

```bash
$ dawson --help
$ dawson <command> --help
```

## User Permissions

Currently, since CloudFormation will create many resources including IAM roles, an `Administrator Access` Managed Policy is the easiest option.

Anyway, it's a good idea to restrict access only to resources you are going to deploy. You may want to `Deny`: `ec2:*`, `rds:*`, `s3:Delete*` etc.  
As a safety check, `dawson` automatically attaches a [StackPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/protect-stack-resources.html) to prevent S3 Buckets and DynamoDB tables from being deleted or replaced, unless the `--danger-delete-storage` CLI option is specified. (broken, see [#4](https://github.com/lusentis/dawson/issues/4))

In addition to specific resources' permissions, `dawson`'s CLI commands requires access to:
* S3
  * PutObject (to `Assets` bucket)
* CloudFormation
  * CreateStack
  * CreateChangeSet
  * DescribeChangeSet
  * ExecuteChangeSet
  * DescribeStacks
  * DescribeStackResources
  * SetStackPolicy
* CloudWatch Logs
  * FilterLogEvents
