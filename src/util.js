import Levenshtein from 'levenshtein';
import R from 'ramda';

const min = (a, b) => Math.min(a, b);

export function levenshtein(m, n) {
    return (new Levenshtein(m, n)).distance;
}

const padArray = (e, count, arr) => {
    const padding = R.repeat(e, Math.max(count, 0));

    return [...padding, ...arr, ...padding];
};

export const substrings = (str, len) =>
    R.dropRepeats(
        R.aperture(len,
            padArray('', len-1, str.split(''))
        )
        .map(a => a.join(''))
    );

export function minLevenshtein(haystack, needle) {
    return substrings(haystack, needle.length)
        .map(s => levenshtein(s, needle))
        .reduce(min, Infinity);
}

export function thisAsParam(fn) {
    return R.curryN(fn.length+1, (...args) => fn.apply(R.last(args), R.init(args)));
}

export function randomRange(a = 0, b = 1) {
    const start = Math.min(a, b);
    const end = Math.max(a, b);

    return Math.random() * (end - start) + start;
}

export function partialString(str, frac) {
    const length = Math.floor(str.length * frac);
    const restLength = str.length - length;

    return str.substr(0, length) + R.repeat('_', restLength).join('');
};

export const randomPartialString = (str, start, end) => partialString(str, randomRange(start, end));
