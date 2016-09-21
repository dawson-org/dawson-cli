
import test from 'tape';

import { PATHNAME_RE, replaceOne, replaceAll, compare } from './pathmatch';

test('replaceOne should replace one {} group with a regexp', t => {
  t.deepEqual(replaceOne('/foo/{bar}/baz'), [9, 'bar', `/foo/(${PATHNAME_RE})/baz`]);
  t.deepEqual(replaceOne('/foo/{bar}/{baz}'), [9, 'bar', `/foo/(${PATHNAME_RE})/{baz}`]);
  t.deepEqual(replaceOne('/foo/{bar}/{baz+}'), [9, 'bar', `/foo/(${PATHNAME_RE})/{baz+}`]);
  t.end();
});

test('replaceAll should replace all {} groups with regexps', t => {
  t.deepEqual(replaceAll('/foo/{bar}/baz'), [`/foo/(${PATHNAME_RE})/baz`, ['bar']]);
  t.deepEqual(replaceAll('/foo/{bar}/{baz}'), [`/foo/(${PATHNAME_RE})/(${PATHNAME_RE})`, ['bar', 'baz']]);
  // t.deepEqual(replaceAll('/foo/{bar}/{baz+}'), [`/foo/(${PATHNAME_RE})/(${PATHNAME_RE})`, ['bar', 'baz+']]);
  t.end();
});

test('compare', t => {
  t.deepEqual(compare('/foo/bar', '/foo/bar'), true);
  t.deepEqual(compare('/foo/bar', '/foo'), false);
  t.deepEqual(compare('/foo/bar', '/foo/bar/baz'), false);
  t.deepEqual(compare('/foo/{bar}', '/foo/xxx'), [['bar'], ['xxx']]);
  t.deepEqual(compare('/foo/{bar}/baz', '/foo/xxx/baz'), [['bar'], ['xxx']]);
  t.deepEqual(compare('/foo/{bar}/baz', '/foo/xxx/byz'), false);
  t.deepEqual(compare('/foo/{bar}/{baz}', '/foo/xxx/yyy'), [['bar', 'baz'], ['xxx', 'yyy']]);
  // t.deepEqual(compare('/foo/{bar+}', '/foo/xxx/yyy'), true);
  t.end();
});
