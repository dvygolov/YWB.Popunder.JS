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

check('init экспортируется', typeof Popunder.init === 'function');
check('defaults.limit = 1', Popunder.defaults.limit === 1);

check('UA: android матчится', matchUserAgent('mozilla/5.0 (linux; android 10)', ['android']) === true);
check('UA: windows не матчится', matchUserAgent('mozilla/5.0 (windows nt 10.0)', ['android']) === false);
check('UA: a&&b — все подстроки', matchUserAgent('foo bar baz', ['foo&&baz']) === true);
check('UA: a&&b — не хватает одной', matchUserAgent('foo qux', ['foo&&baz']) === false);
check('UA: a||b — любая группа', matchUserAgent('x y', ['a||y']) === true);
check('UA: пустой список', matchUserAgent('anything', []) === false);

check('expiry: -1 даёт expires', /expires=/.test(cookieExpiry(-1)));
check('expiry: 0 — сессионная', cookieExpiry(0) === '');
check('expiry: 30 минут даёт expires', /expires=/.test(cookieExpiry(30)));

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки пройдены.');
