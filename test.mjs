import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Popunder = require('./ywbpopunder.js');

let failed = 0;
const check = (label, condition) => {
  if (condition) {
    console.log(`ok - ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL - ${label}`);
  }
};

const { matchUserAgent, cookieExpiry } = Popunder.utils;

check('init is exported', typeof Popunder.init === 'function');
check('defaults.limit is 1', Popunder.defaults.limit === 1);

check('UA: android matches', matchUserAgent('mozilla/5.0 (linux; android 10)', ['android']) === true);
check('UA: windows does not match', matchUserAgent('mozilla/5.0 (windows nt 10.0)', ['android']) === false);
check('UA: a&&b — all substrings', matchUserAgent('foo bar baz', ['foo&&baz']) === true);
check('UA: a&&b — one missing', matchUserAgent('foo qux', ['foo&&baz']) === false);
check('UA: a||b — any group', matchUserAgent('x y', ['a||y']) === true);
check('UA: empty list', matchUserAgent('anything', []) === false);

check('expiry: -1 produces expires', /expires=/.test(cookieExpiry(-1)));
check('expiry: 0 is a session cookie', cookieExpiry(0) === '');
check('expiry: 30 minutes produces expires', /expires=/.test(cookieExpiry(30)));

if (failed) {
  console.error(`\nFailed checks: ${failed}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
