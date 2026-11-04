import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hasItemConflict, markFor, marksFor, type ConflictView } from '../src/conflictText.ts';

// WI-CUST-006: the wording of a customer's own conflicts. The rules: say what the item contains and why it is marked, name the option when the
// conflict comes through an option, and never claim an item is safe, free of an allergen or a match.

const labels = new Map([
  ['tree-nut', 'Tree nuts'],
  ['dairy', 'Milk (dairy)'],
  ['sesame', 'Sesame'],
]);
const options = new Map([
  ['mod-walnuts', 'Add walnuts'],
  ['mod-seeds', 'Seed crust'],
]);
const c = (over: Partial<ConflictView>): ConflictView => ({
  allergenId: 'tree-nut',
  severity: 'ALLERGY',
  source: 'ITEM',
  optionIds: [],
  ...over,
});

describe('markFor', () => {
  test('an allergy on the item names the allergen and says it was listed as an allergy', () => {
    const m = markFor(c({}), labels, options);
    assert.equal(m.severity, 'ALLERGY');
    assert.equal(m.heading, 'Allergy warning');
    assert.equal(m.text, 'Contains tree nuts, which you listed as an allergy');
  });

  test('an avoid is worded more quietly', () => {
    const m = markFor(c({ allergenId: 'dairy', severity: 'AVOID' }), labels, options);
    assert.equal(m.heading, 'You avoid this');
    assert.equal(m.text, 'Contains milk (dairy), which you avoid');
  });

  test('a conflict through an option names the option', () => {
    const m = markFor(c({ source: 'OPTION', optionIds: ['mod-walnuts'] }), labels, options);
    assert.equal(m.text, 'Add walnuts contains tree nuts, which you listed as an allergy');
  });

  test('several options are joined, and an option the page does not know is still said', () => {
    const m = markFor(c({ source: 'OPTION', optionIds: ['mod-walnuts', 'mod-seeds', 'mod-x'] }), labels, options);
    assert.equal(m.text, 'Add walnuts, Seed crust and An option contains tree nuts, which you listed as an allergy');
  });

  test('an allergen the registry does not list falls back to its id rather than vanishing', () => {
    assert.match(markFor(c({ allergenId: 'lupin' }), labels, options).text, /Contains lupin,/);
  });

  test('a severity this page does not know is shown as an allergy, never dropped', () => {
    assert.equal(markFor(c({ severity: '%future added value' }), labels, options).severity, 'ALLERGY');
  });

  test('no wording claims safety', () => {
    const all = [
      markFor(c({}), labels, options),
      markFor(c({ severity: 'AVOID' }), labels, options),
      markFor(c({ source: 'OPTION', optionIds: ['mod-walnuts'] }), labels, options),
    ];
    for (const m of all) assert.doesNotMatch(`${m.heading} ${m.text}`, /\b(safe|free|match|suitable)\b/i);
  });
});

describe('marksFor and hasItemConflict', () => {
  test('the serious marks come first, the order otherwise kept', () => {
    const marks = marksFor(
      [c({ allergenId: 'dairy', severity: 'AVOID' }), c({ allergenId: 'sesame' }), c({ allergenId: 'tree-nut' })],
      labels,
      options,
    );
    assert.deepEqual(
      marks.map((m) => m.allergenId),
      ['sesame', 'tree-nut', 'dairy'],
    );
  });

  test('only an item-level conflict counts for hiding; an option alone does not', () => {
    assert.equal(hasItemConflict([c({ source: 'OPTION', optionIds: ['mod-walnuts'] })]), false);
    assert.equal(hasItemConflict([c({ source: 'OPTION', optionIds: ['mod-walnuts'] }), c({})]), true);
    assert.equal(hasItemConflict([]), false);
  });
});
