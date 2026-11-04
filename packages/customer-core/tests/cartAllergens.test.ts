import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allergensToTell,
  allergyConflictKey,
  lineAllergenSentences,
  lineConflictText,
  needsAcknowledgement,
} from '../src/cartAllergens.ts';
import { fingerprint, toPlaceOrderInput, type Cart } from '../src/cart.ts';
import type { ConflictView } from '../src/conflictText.ts';

// WI-CUST-008: the words and rules of allergens in the cart and at checkout, and what the checkout request does with the customer's choice.

const labels = new Map([
  ['tree-nut', 'Tree nuts'],
  ['gluten', 'Gluten (wheat, rye, barley)'],
  ['sesame', 'Sesame'],
  ['dairy', 'Milk (dairy)'],
]);
const c = (over: Partial<ConflictView> = {}): ConflictView => ({
  allergenId: 'tree-nut',
  severity: 'ALLERGY',
  source: 'ITEM',
  optionIds: [],
  ...over,
});

describe('lineAllergenSentences', () => {
  const croissant = { item: ['gluten', 'tree-nut'], options: new Map([['mod-almond', ['tree-nut']]]) };

  test('names the item’s allergens and each chosen option’s', () => {
    assert.deepEqual(lineAllergenSentences(croissant, [{ id: 'mod-almond', name: 'Extra almond' }], labels), [
      'Contains gluten (wheat, rye, barley), tree nuts',
      'Extra almond contains tree nuts',
    ]);
  });

  test('an option that is not chosen is not mentioned', () => {
    assert.deepEqual(lineAllergenSentences(croissant, [], labels), ['Contains gluten (wheat, rye, barley), tree nuts']);
  });

  test('a line with nothing flagged says exactly that, and nothing more', () => {
    const plain = { item: [], options: new Map<string, string[]>() };
    assert.deepEqual(lineAllergenSentences(plain, [], labels), ['No allergens flagged by the bakery']);
    assert.doesNotMatch(lineAllergenSentences(plain, [], labels).join(' '), /\b(safe|free of|allergen-free)\b/i);
  });

  test('a listing that could not be found says nothing here (checkout itself reports it)', () => {
    assert.deepEqual(lineAllergenSentences(undefined, [], labels), []);
  });

  test('an allergen the registry does not label is shown as its id', () => {
    assert.deepEqual(lineAllergenSentences({ item: ['lupin'], options: new Map() }, [], labels), ['Contains lupin']);
  });
});

describe('lineConflictText', () => {
  test('an item conflict names the line', () => {
    const t = lineConflictText('Almond Croissant', c(), labels, new Map());
    assert.equal(t.line, 'Almond Croissant contains tree nuts, which you listed as an allergy');
    assert.equal(t.severity, 'ALLERGY');
  });

  test('an avoid reads as a note', () => {
    const t = lineConflictText('Almond Croissant', c({ allergenId: 'dairy', severity: 'AVOID' }), labels, new Map());
    assert.equal(t.line, 'Almond Croissant contains milk (dairy), which you avoid');
    assert.equal(t.heading, 'You avoid this');
  });

  test('an option conflict names the line and the option', () => {
    const t = lineConflictText(
      'Country Sourdough',
      c({ allergenId: 'sesame', source: 'OPTION', optionIds: ['mod-seeds'] }),
      labels,
      new Map([['mod-seeds', 'Seed crust']]),
    );
    assert.equal(t.line, 'Country Sourdough: Seed crust contains sesame, which you listed as an allergy');
  });
});

describe('the acknowledgement', () => {
  test('only a serious conflict asks for it', () => {
    assert.equal(needsAcknowledgement([]), false);
    assert.equal(needsAcknowledgement([{ conflict: c({ severity: 'AVOID' }) }]), false);
    assert.equal(needsAcknowledgement([{ conflict: c() }]), true);
    assert.equal(needsAcknowledgement([{ conflict: c({ severity: 'AVOID' }) }, { conflict: c() }]), true);
  });

  test('a severity the page does not know counts as serious', () => {
    assert.equal(needsAcknowledgement([{ conflict: c({ severity: '%future added value' }) }]), true);
  });

  test('the key changes when the serious conflicts change, and not for an avoid', () => {
    const a = [{ lineIndex: 0, conflict: c() }];
    const same = [{ lineIndex: 0, conflict: c() }];
    assert.equal(allergyConflictKey(a), allergyConflictKey(same));
    assert.notEqual(allergyConflictKey(a), allergyConflictKey([{ lineIndex: 1, conflict: c() }]));
    assert.notEqual(
      allergyConflictKey(a),
      allergyConflictKey([...a, { lineIndex: 0, conflict: c({ allergenId: 'sesame' }) }]),
    );
    assert.equal(
      allergyConflictKey(a),
      allergyConflictKey([...a, { lineIndex: 0, conflict: c({ allergenId: 'dairy', severity: 'AVOID' }) }]),
    );
  });
});

describe('what is told to the bakery', () => {
  test('the allergies the customer has not unticked, and never the avoid list', () => {
    assert.deepEqual(allergensToTell(['tree-nut', 'sesame'], new Set()), ['tree-nut', 'sesame']);
    assert.deepEqual(allergensToTell(['tree-nut', 'sesame'], new Set(['sesame'])), ['tree-nut']);
    assert.deepEqual(allergensToTell(['tree-nut'], new Set(['tree-nut'])), []);
    assert.deepEqual(allergensToTell([], new Set()), []);
  });
});

describe('the checkout request', () => {
  const cart: Cart = {
    vendorId: 'vendor-1',
    lines: [
      {
        listingId: 'bGlzdA==',
        name: 'Loaf',
        unitPriceCents: 800,
        currency: 'USD',
        modifiers: [],
        quantity: 1,
        maxPerOrder: null,
      },
    ],
  };

  test('sends allergens only when there are some, sorted and without repeats', () => {
    assert.equal('allergens' in toPlaceOrderInput(cart, null), false);
    assert.equal('allergens' in toPlaceOrderInput(cart, null, []), false);
    assert.deepEqual(toPlaceOrderInput(cart, null, ['tree-nut', 'dairy', 'tree-nut']).allergens, ['dairy', 'tree-nut']);
  });

  test('a different choice of allergens is a different checkout (a new idempotency key), the same choice in any order is not', () => {
    assert.notEqual(fingerprint(cart, null, []), fingerprint(cart, null, ['dairy']));
    assert.notEqual(fingerprint(cart, null, ['dairy']), fingerprint(cart, null, ['dairy', 'egg']));
    assert.equal(fingerprint(cart, null, ['egg', 'dairy']), fingerprint(cart, null, ['dairy', 'egg']));
    assert.equal(fingerprint(cart, null), fingerprint(cart, null, []));
  });
});
