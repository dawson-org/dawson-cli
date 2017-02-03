import test from 'ava';
import { buildCreateStackParams, templateStackName } from './cloudformation';

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

test('returns the correct stackName', t => {
  const actual = templateStackName({ appName: 'myapp', stage: 'devel' });
  const expected = 'myappDevel';
  t.is(actual, expected);
});

test('returns the correct stackName without stage', t => {
  // an empty stage value is currently used for the support stack
  const actual = templateStackName({ appName: 'support' });
  const expected = 'support';
  t.is(actual, expected);
});
