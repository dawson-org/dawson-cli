
require('colors');
require('console.table');

import { inspect } from 'util';

export let DEBUG_LEVEL = false;

function stringify (obj) {
  if (typeof obj === 'string') {
    return obj;
  }
  return inspect(obj, { depth: 10 });
}

export function log (...args) {
  args.map(stringify).forEach(str => {
    process.stderr.write(str + ' ');
  });
  process.stderr.write('\n');
}

export function table (...args) {
  console.table(...args);
}

export function title (...args) {
  args.map(stringify).forEach(str => {
    process.stderr.write(str.bold + ' ');
  });
  process.stderr.write('\n');
}

export function debug (...args) {
  if (!DEBUG_LEVEL) {
    return;
  }
  args.map(stringify).forEach(str => {
    process.stderr.write(str.gray + ' ');
  });
  process.stderr.write('\n');
}

export function success (...args) {
  args.map(stringify).forEach(str => {
    process.stderr.write(str.green + ' ');
  });
  process.stderr.write('\n');
}

export function error (...args) {
  args.map(stringify).forEach(str => {
    process.stderr.write(str.red + ' ');
  });
  process.stderr.write('\n');
}

export function danger (...args) {
  args.map(stringify).forEach(str => {
    process.stderr.write(str.red.inverse + ' ');
  });
  process.stderr.write('\n');
}

export function warning (...args) {
  args.map(stringify).forEach(str => {
    process.stderr.write(str.yellow + ' ');
  });
  process.stderr.write('\n');
}

export function enableDebug () {
  DEBUG_LEVEL = true;
}
