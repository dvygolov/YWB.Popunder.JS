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

const { matchUserAgent, cookieExpiry, detectDevice } = Popunder.utils;

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

check('device: android is mobile', detectDevice('mozilla/5.0 (linux; android 10)').mobile === true);
check('device: windows is not mobile', detectDevice('mozilla/5.0 (windows nt 10.0)').mobile === false);
check(
  'device: iPadOS (Macintosh + touch) is ios',
  detectDevice('mozilla/5.0 (macintosh; intel mac os x 10_15_7)', 'MacIntel', 5).os === 'ios',
);
check(
  'device: desktop Mac stays mac',
  detectDevice('mozilla/5.0 (macintosh; intel mac os x 10_15_7)', 'MacIntel', 0).os === 'mac',
);
check('device: FB in-app detected', detectDevice('mozilla/5.0 (iphone) [fb_iab/fbav;]').inApp === true);
check('device: Instagram in-app detected', detectDevice('mozilla/5.0 (linux; android 10) instagram 200.0').inApp === true);
check('device: plain safari is not in-app', detectDevice('mozilla/5.0 (iphone) safari/604.1').inApp === false);

if (failed) {
  console.error(`\nFailed checks: ${failed}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
