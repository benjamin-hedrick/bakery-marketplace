import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EMPTY_CART, addLine, type CartLine } from '../src/cart.ts';
import { ADD_REFUSAL_TEXT, decideAdd, type AddRefusal } from '../src/stockCheck.ts';

// WI-CUST-009: adding to the order reads the stock again, and the decision is made from that read.

const line: CartLine = {
  listingId: 'TGlzdGluZzpzb3VyZG91Z2g=',
  name: 'Country Sourdough',
  unitPriceCents: 800,
  currency: 'USD',
  modifiers: [],
  quantity: 3,
  maxPerOrder: 4,
};

describe('decideAdd', () => {
  test('an item in stock or low may be added, with the fresh limit', () => {
    assert.deepEqual(decideAdd({ kind: 'listing', stock: { status: 'IN_STOCK', maxPerOrder: 4 } }), {
      allowed: true,
      maxPerOrder: 4,
    });
    assert.deepEqual(decideAdd({ kind: 'listing', stock: { status: 'LOW', maxPerOrder: null } }), {
      allowed: true,
      maxPerOrder: null,
    });
  });

  test('a missing limit counts as no limit', () => {
    assert.deepEqual(decideAdd({ kind: 'listing', stock: { status: 'IN_STOCK', maxPerOrder: undefined } }), {
      allowed: true,
      maxPerOrder: null,
    });
  });

  test('a sold-out item is refused as sold out', () => {
    assert.deepEqual(decideAdd({ kind: 'listing', stock: { status: 'SOLD_OUT', maxPerOrder: 4 } }), {
      allowed: false,
      refusal: 'sold_out',
    });
  });

  test('a status this code does not know is unavailable, not guessed to be fine', () => {
    assert.deepEqual(decideAdd({ kind: 'listing', stock: { status: '%future added value', maxPerOrder: null } }), {
      allowed: false,
      refusal: 'unavailable',
    });
    assert.deepEqual(decideAdd({ kind: 'listing', stock: { status: '', maxPerOrder: null } }), {
      allowed: false,
      refusal: 'unavailable',
    });
  });

  test('a listing that is no longer public is refused', () => {
    assert.deepEqual(decideAdd({ kind: 'missing' }), { allowed: false, refusal: 'missing' });
  });

  test('a read that failed adds nothing and says the check could not be made', () => {
    assert.deepEqual(decideAdd({ kind: 'failed' }), { allowed: false, refusal: 'check_failed' });
  });

  test('every refusal has plain words that do not blame the customer or promise stock', () => {
    const all: AddRefusal[] = ['sold_out', 'unavailable', 'missing', 'check_failed'];
    for (const refusal of all) {
      assert.ok(ADD_REFUSAL_TEXT[refusal].length > 0);
      assert.match(ADD_REFUSAL_TEXT[refusal], /not added/);
    }
  });
});

describe('the fresh limit holds the quantity', () => {
  test('a quantity above the fresh per-order limit is added at the limit and says it was capped', () => {
    const decision = decideAdd({ kind: 'listing', stock: { status: 'IN_STOCK', maxPerOrder: 2 } });
    assert.ok(decision.allowed);
    const result = addLine(EMPTY_CART, 'vendor-1', { ...line, maxPerOrder: decision.maxPerOrder });
    assert.ok('cart' in result);
    assert.equal(result.cart.lines[0]!.quantity, 2);
    assert.equal(result.capped, true);
  });

  test('the same quantity under a fresh limit that was removed is added in full', () => {
    const decision = decideAdd({ kind: 'listing', stock: { status: 'IN_STOCK', maxPerOrder: null } });
    assert.ok(decision.allowed);
    const result = addLine(EMPTY_CART, 'vendor-1', { ...line, quantity: 3, maxPerOrder: decision.maxPerOrder });
    assert.ok('cart' in result);
    assert.equal(result.cart.lines[0]!.quantity, 3);
    assert.equal(result.capped, false);
  });
});
