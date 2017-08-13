import test from 'ava';
import jsv from 'jsverify';

import { substrings, minLevenshtein, thisAsParam, randomRange, partialString } from '../src/util';

const nonzeroNatArb = jsv.suchthat('nat', n => n > 0);

test('substrings', t => {
    t.deepEqual(substrings('hello', 3), [
        'h',
        'he',
        'hel',
        'ell',
        'llo',
        'lo',
        'o'
    ]);
});

test('substrings count', t => {
    jsv.assertForall('nestring', nonzeroNatArb, (str, len) =>
        substrings(str, len).length === str.length+(Math.min(str.length, len)-1)
    );

    t.pass();
});

test('minimum levenshtein', t => {
    t.is(minLevenshtein('my dog is named lars', 'doggo'), 2);

    t.is(minLevenshtein('you think that is cool? i got something cooler', 'cool'), 0);
    t.is(minLevenshtein('you think that is cool? i got something cooler', 'coolest'), 2);
});

test('minimum levenshtein for substring == 0', t => {
    jsv.assertForall('string', 'nat', 'nat', (str, i, len) =>
        minLevenshtein(str, str.substr(i, len)) === 0
    );

    t.pass();
});

test('thisAsParam with no params', t => {
    function double() { return this+this; }

    t.is(thisAsParam(double)('hey'), 'heyhey');
});

test('thisAsParam with params', t => {
    function surround(str) { return str+this+str; }

    t.is(thisAsParam(surround)('WOW', 'hey'), 'WOWheyWOW');
});

test('thisAsParam with params curried', t => {
    function surround(str) { return str+this+str; }

    t.is(thisAsParam(surround)('WOW')('hey'), 'WOWheyWOW');
});

test('randomRange', t => {
    jsv.assertForall('number', 'number', (a, b) => {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        const randVal = randomRange(a, b);

        return start <= randVal && randVal <= end;
    });

    t.pass();
});

test('partialString', t => {
    jsv.assertForall('string', 'number 1', (str, frac) => {
        const partStr = partialString(str, frac).replace(/_+$/, '');

        return str.substring(0, partStr.length) === partStr;
    });

    t.pass();
});

test('partialString same length', t => {
    jsv.assertForall('string', 'number 0 1', (str, frac) => {
        const partStr = partialString(str, frac);

        return str.length === partStr.length;
    });

    t.pass();
});
