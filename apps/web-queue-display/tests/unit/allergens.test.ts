import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { allergenText, applyChange, type QueueOrder } from '../../src/lib/queue.ts';

// WI-QUE-005: what the card says about an order's allergens. An order without allergens says nothing (never "no allergies"); a label the registry
// does not have is shown as the id, never dropped; the wording never claims anything is safe.

const labels = new Map([
  ['tree-nut', 'Tree nuts'],
  ['sesame', 'Sesame'],
  ['gluten', 'Gluten (wheat, rye, barley)'],
]);

describe('allergenText', () => {
  test('names the allergens in plain words, in the order given', () => {
    assert.equal(allergenText(['tree-nut', 'sesame'], labels), 'Allergy: tree nuts, sesame');
    assert.equal(allergenText(['gluten'], labels), 'Allergy: gluten (wheat, rye, barley)');
  });

  test('an order with none says nothing at all', () => {
    assert.equal(allergenText([], labels), null);
    assert.equal(allergenText(undefined, labels), null);
    assert.equal(allergenText(null, labels), null);
  });

  test('an id the registry does not know is shown as itself, and every allergen is kept', () => {
    assert.equal(allergenText(['sesame', 'lupin'], labels), 'Allergy: sesame, lupin');
    assert.equal(allergenText(['tree-nut'], new Map()), 'Allergy: tree-nut'); // the registry could not be read
  });

  test('the wording claims nothing about safety', () => {
    for (const text of [allergenText(['tree-nut'], labels), allergenText(['lupin'], new Map())])
      assert.doesNotMatch(text ?? '', /\b(safe|free|no allerg)/i);
  });
});

describe('a pushed change carries the allergens with it', () => {
  const base: QueueOrder = {
    id: 'o1',
    reference: 'O1',
    status: 'PLACED',
    updatedAt: '2026-11-04T13:00:00+00:00',
    sequence: 1,
    allergens: ['sesame'],
  };

  test('the newer order replaces the held one, allergens included', () => {
    const next = applyChange([base], { ...base, status: 'CONFIRMED', sequence: 2 });
    assert.deepEqual(next[0]!.allergens, ['sesame']);
  });

  test('an older or repeated change never replaces what is held', () => {
    const held = { ...base, sequence: 3, allergens: ['sesame'] };
    const next = applyChange([held], { ...base, sequence: 2, allergens: [] });
    assert.deepEqual(next[0]!.allergens, ['sesame']);
  });
});
