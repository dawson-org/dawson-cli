import test from 'ava';
import createError from './error';

test('creates an error', t => {
  const err = createError({
    kind: '3452345',
    reason: '53656564',
    detailedReason: '2893475923847593',
    solution: '985u4986'
  });
  t.true(err.isDawsonError);
  t.snapshot(err.toFormattedString());
});

test('creates an error with default params', t => {
  const err = createError({});
  t.true(err.isDawsonError);
  t.snapshot(err.toFormattedString());
});
