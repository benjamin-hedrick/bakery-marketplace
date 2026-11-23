import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  emptyForm,
  formatCents,
  formFieldFor,
  formFromListing,
  adjustedMessage,
  groupProblems,
  newCreateKey,
  newOptionId,
  parseDollars,
  parseWhole,
  stockText,
  toInput,
  type LoadedListing,
} from '../../src/lib/listings.ts';

// WI-CAT-008: the listing form's logic. The catalog decides every rule; these check that what the vendor typed is sent as typed, that a save
// round-trips what was loaded, and that the screen never sends a count it read earlier (ADR-0017).

const loaded = (over: Partial<LoadedListing> = {}): LoadedListing => ({
  id: 'TGlzdGluZzpsaXN0aW5nLTE=',
  name: 'Almond Croissant',
  description: 'Twice baked.',
  category: 'Pastry',
  price: { cents: 425, currency: 'USD' },
  status: 'PUBLISHED',
  allergenFlags: ['gluten', 'tree-nut'],
  tags: [{ id: 'vegetarian', label: 'Vegetarian' }],
  modifiers: [{ id: 'mod-warm', name: 'Warmed', priceDelta: { cents: 50 }, allergens: [], tags: [{ id: 'local' }] }],
  stock: { status: 'LOW', maxPerOrder: 4, availableQuantity: 3, lowStockThreshold: 5 },
  editVersion: 7,
  updatedAt: '2026-11-18T10:00:00Z',
  ...over,
});

describe('prices', () => {
  test('dollars and cents as typed become cents', () => {
    const cases: [string, number | null][] = [
      ['8', 800],
      ['8.5', 850],
      ['8.50', 850],
      ['$8.50', 850],
      [' 1,250.00 ', 125000],
      ['0', 0],
      ['-1.00', -100], // sent: the catalog refuses a negative price with its own sentence
      ['9999999.99', 999999999], // the most that fits the BFF's Int as cents
      ['10000000', null],
      ['8.505', null],
      ['eight', null],
      ['', null],
      ['1e3', null],
    ];
    for (const [text, cents] of cases) assert.equal(parseDollars(text), cents, JSON.stringify(text));
  });

  test('cents are shown as dollars and cents', () => {
    assert.equal(formatCents(850), '$8.50');
    assert.equal(formatCents(5), '$0.05');
    assert.equal(formatCents(0), '$0.00');
    assert.equal(formatCents(-100), '-$1.00');
  });

  test('whole numbers: empty is null, anything else that is not one is invalid', () => {
    assert.equal(parseWhole(''), null);
    assert.equal(parseWhole(' 12 '), 12);
    assert.equal(parseWhole('-3'), -3); // sent: the catalog decides
    assert.equal(parseWhole('1.5'), 'invalid');
    assert.equal(parseWhole('ten'), 'invalid');
    assert.equal(parseWhole('1234567890'), 'invalid');
  });
});

describe('toInput', () => {
  test('a create sends everything typed, with the starting count of a counted listing', () => {
    const form = {
      ...emptyForm(),
      name: 'Rye',
      category: 'Bread',
      price: '6.75',
      allergens: ['gluten'],
      tags: ['vegan'],
      mode: 'COUNTED' as const,
      startingQuantity: '12',
      maxPerOrder: '3',
      lowStockThreshold: '',
      options: [{ key: 'k', id: 'opt-1', name: 'Sliced', price: '', allergens: [], tags: [] }],
    };
    const result = toInput(form, null);
    assert.ok('input' in result);
    assert.deepEqual(result.input, {
      name: 'Rye',
      description: null,
      category: 'Bread',
      priceCents: 675,
      status: 'DRAFT',
      modifiers: [{ id: 'opt-1', name: 'Sliced', priceDeltaCents: 0, allergens: [], tags: [] }],
      allergenFlags: ['gluten'],
      tags: ['vegan'],
      stock: { mode: 'COUNTED', availableQuantity: 12, maxPerOrder: 3, lowStockThreshold: null },
    });
  });

  test('an edit round-trips every loaded field, and a counted listing that stays counted is sent without a count', () => {
    const form = formFromListing(loaded());
    const result = toInput({ ...form, startingQuantity: '99' }, true);
    assert.ok('input' in result);
    assert.deepEqual(result.input, {
      name: 'Almond Croissant',
      description: 'Twice baked.',
      category: 'Pastry',
      priceCents: 425,
      status: 'PUBLISHED',
      modifiers: [{ id: 'mod-warm', name: 'Warmed', priceDeltaCents: 50, allergens: [], tags: ['local'] }],
      allergenFlags: ['gluten', 'tree-nut'],
      tags: ['vegetarian'],
      stock: { mode: 'COUNTED', maxPerOrder: 4, lowStockThreshold: 5 },
    });
    assert.equal('availableQuantity' in (result.input.stock ?? {}), false);
  });

  test('a switch to counted sends the starting count; a switch to made to order sends none', () => {
    const madeToOrder = formFromListing(
      loaded({ stock: { status: 'IN_STOCK', maxPerOrder: null, availableQuantity: null, lowStockThreshold: null } }),
    );
    assert.equal(madeToOrder.mode, 'MADE_TO_ORDER');
    const toCounted = toInput({ ...madeToOrder, mode: 'COUNTED', startingQuantity: '20' }, false);
    assert.ok('input' in toCounted);
    assert.equal(toCounted.input.stock?.availableQuantity, 20);

    const toMade = toInput({ ...formFromListing(loaded()), mode: 'MADE_TO_ORDER', startingQuantity: '20' }, true);
    assert.ok('input' in toMade);
    assert.deepEqual(toMade.input.stock, { mode: 'MADE_TO_ORDER', maxPerOrder: 4, lowStockThreshold: 5 });
  });

  test('text that is not a number is not sent, and is named by its field', () => {
    const result = toInput(
      {
        ...emptyForm(),
        price: 'cheap',
        mode: 'COUNTED',
        startingQuantity: 'lots',
        maxPerOrder: '2.5',
        options: [{ key: 'k', id: 'opt-1', name: 'x', price: 'free', allergens: [], tags: [] }],
      },
      null,
    );
    assert.ok('problems' in result);
    assert.deepEqual(Object.keys(result.problems).sort(), [
      'modifiers[0].priceDeltaCents',
      'priceCents',
      'stock.availableQuantity',
      'stock.maxPerOrder',
    ]);
  });

  test('the form keeps an empty description as none, and nothing in the form is trimmed or changed otherwise', () => {
    const result = toInput({ ...emptyForm(), name: '  Loaf  ', price: '1', description: '   ' }, null);
    assert.ok('input' in result);
    assert.equal(result.input.name, '  Loaf  '); // the catalog trims and checks
    assert.equal(result.input.description, null);
  });
});

describe('the catalog’s field names', () => {
  test('each field the catalog names goes beside its form element', () => {
    const cases: [string, string | null][] = [
      ['name', 'listing-name'],
      ['priceCents', 'listing-price'],
      ['allergenFlags', 'listing-allergens'],
      ['allergenFlags[2]', 'listing-allergens'],
      ['tags[0]', 'listing-tags'],
      ['modifiers', 'listing-options'],
      ['modifiers[1].name', 'option-1-name'],
      ['modifiers[1].id', 'option-1-name'],
      ['modifiers[0].priceDeltaCents', 'option-0-price'],
      ['modifiers[0].allergens[3]', 'option-0-allergens'],
      ['modifiers[0].tags[1]', 'option-0-tags'],
      ['stock.availableQuantity', 'listing-starting-quantity'],
      ['stock.mode', 'listing-mode'],
      ['idempotencyKey', null],
      ['constructor', null],
      ['something-new', null],
    ];
    for (const [field, element] of cases) assert.equal(formFieldFor(field), element, field);
  });

  test('problems are grouped by element, and the rest kept for the summary', () => {
    assert.deepEqual(
      groupProblems([
        { field: 'name', message: 'Name is required.' },
        { field: 'allergenFlags[1]', message: 'Not an allergen the catalog knows.' },
        { field: 'allergenFlags[3]', message: 'Not an allergen the catalog knows.' },
        { field: 'expectedEditVersion', message: 'Reload it.' },
      ]),
      {
        byElement: {
          'listing-name': ['Name is required.'],
          'listing-allergens': ['Not an allergen the catalog knows.', 'Not an allergen the catalog knows.'],
        },
        unplaced: ['Reload it.'],
      },
    );
  });
});

describe('the rest', () => {
  test('stock is shown as made to order or the count with its status', () => {
    assert.equal(
      stockText({ status: 'IN_STOCK', maxPerOrder: null, availableQuantity: null, lowStockThreshold: null }),
      'Made to order',
    );
    assert.equal(
      stockText({ status: 'LOW', maxPerOrder: null, availableQuantity: 3, lowStockThreshold: 5 }),
      '3 left · Low',
    );
    assert.equal(
      stockText({ status: 'SOLD_OUT', maxPerOrder: null, availableQuantity: 0, lowStockThreshold: null }),
      '0 left · Sold out',
    );
  });

  test('a new option id is one the catalog accepts', () => {
    for (const r of [0, 0.5, 0.999999])
      assert.match(
        newOptionId(() => r),
        /^[a-z0-9][a-z0-9-]{0,63}$/,
      );
  });
});

// Register 239 (the review of WI-CAT-007 and WI-CAT-008).
describe('the create key', () => {
  test('is the browser’s UUID when it has one', () => {
    assert.equal(
      newCreateKey({ randomUUID: () => 'from-randomUUID', getRandomValues: () => assert.fail('not needed') } as never),
      'from-randomUUID',
    );
  });

  test('is still a version 4 UUID where randomUUID does not exist (a page opened over plain http)', () => {
    const key = newCreateKey({ getRandomValues: (a: Uint8Array) => a.fill(0xff) } as never);
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('the message after an adjustment', () => {
  test('is the plain count for add and remove, and for a Sold out that reached zero', () => {
    assert.equal(adjustedMessage('Loaf', 4, false), 'Loaf: 4 left.');
    assert.equal(adjustedMessage('Loaf', 0, true), 'Loaf: 0 left.');
  });

  test('says Sold out did not reach zero when units were added after the screen read the count', () => {
    const text = adjustedMessage('Loaf', 5, true);
    assert.match(text, /^Loaf: 5 left\./);
    assert.match(text, /did not reach zero/);
  });
});
