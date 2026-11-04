import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { filterHref, MAX_FILTER_TAGS, parseTagQuery, toggleTag } from '../src/tagFilter.ts';

// WI-TAG-003: which tags the address names and the address that adds or removes one. The catalog decides which tags may be used; this keeps the address tidy.

describe('parseTagQuery', () => {
  test('one value or several, in the order given', () => {
    assert.deepEqual(parseTagQuery('vegan'), ['vegan']);
    assert.deepEqual(parseTagQuery(['vegan', 'local-favourite']), ['vegan', 'local-favourite']);
    assert.deepEqual(parseTagQuery(undefined), []);
  });

  test('lower-cased, trimmed and without repeats', () => {
    assert.deepEqual(parseTagQuery([' VEGAN ', 'vegan', 'Vegan']), ['vegan']);
  });

  test('anything that is not the shape of an id is dropped, so odd addresses send nothing odd', () => {
    assert.deepEqual(parseTagQuery(['vegan', '', 'a b', '../x', '<script>', '-lead', 'x'.repeat(41), 'ok-1']), [
      'vegan',
      'ok-1',
    ]);
  });

  test('no more than the page will ask for', () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    assert.equal(parseTagQuery(many).length, MAX_FILTER_TAGS);
  });
});

describe('toggleTag and filterHref', () => {
  test('a tag is added at the end, and removed when it is already there', () => {
    assert.deepEqual(toggleTag([], 'vegan'), ['vegan']);
    assert.deepEqual(toggleTag(['vegan'], 'local'), ['vegan', 'local']);
    assert.deepEqual(toggleTag(['vegan', 'local'], 'vegan'), ['local']);
  });

  test('nothing is added past the limit, but a selected tag can always be removed', () => {
    const full = Array.from({ length: MAX_FILTER_TAGS }, (_, i) => `t${i}`);
    assert.deepEqual(toggleTag(full, 'extra'), full);
    assert.equal(toggleTag(full, 't3').length, MAX_FILTER_TAGS - 1);
  });

  test('the address is the plain page with no tags and ?tag=... with some', () => {
    assert.deepEqual(filterHref([]), { pathname: '/', query: {} });
    assert.deepEqual(filterHref(['vegan', 'local']), { pathname: '/', query: { tag: ['vegan', 'local'] } });
  });
});
