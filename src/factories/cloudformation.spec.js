import test from 'ava';
import { buildCreateStackParams } from './cloudformation';

test('creates cloudformation updateStack params with an inline source', t => {
  t.snapshot(
    buildCreateStackParams({
      stackName: 'bar',
      cfTemplateJSON: JSON.stringify({ Resources: {}, Outputs: {} }),
      inline: true
    })
  );
});

test('creates cloudformation updateStack params with source from S3', t => {
  t.snapshot(
    buildCreateStackParams({ stackName: 'bar', templateURL: 'https://s3....' })
  );
});
