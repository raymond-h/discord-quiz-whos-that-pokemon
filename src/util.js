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
