import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EMPTY_CART, addLine, fingerprint, toPlaceOrderInput, type CartLine } from '../src/cart.ts';
import { NO_PAYMENT_METHODS_TEXT, selectedPaymentMethodId, type PaymentMethod } from '../src/paymentMethod.ts';

// WI-ORD-010: the customer chooses a saved payment method at checkout; only its id is sent.

const methods: PaymentMethod[] = [
  { id: 'pm-alice-ok', description: 'Test card (accepted)' },
  { id: 'pm-alice-refused', description: 'Test card (refused)' },
];
const line: CartLine = {
  listingId: 'TGlzdGluZzpzb3VyZG91Z2g=',
  name: 'Country Sourdough',
  unitPriceCents: 800,
  currency: 'USD',
  modifiers: [],
  quantity: 1,
  maxPerOrder: 4,
};
const cart = () => {
  const added = addLine(EMPTY_CART, 'vendor-shop-001', line);
  if (!('cart' in added)) throw new Error('the line was not added');
  return added.cart;
};

describe('the method a form shows chosen', () => {
  test('is the first one when nothing was picked, or the pick has gone away', () => {
    assert.equal(selectedPaymentMethodId(methods, null), 'pm-alice-ok');
    assert.equal(selectedPaymentMethodId(methods, 'pm-someone-elses'), 'pm-alice-ok');
  });

  test('is the pick when it is still one of the customer methods', () => {
    assert.equal(selectedPaymentMethodId(methods, 'pm-alice-refused'), 'pm-alice-refused');
  });

  test('is null when there are none, and then an order cannot be placed', () => {
    assert.equal(selectedPaymentMethodId([], null), null);
    assert.equal(selectedPaymentMethodId([], 'pm-alice-ok'), null);
    assert.match(NO_PAYMENT_METHODS_TEXT, /no saved payment method/);
  });
});

describe('the checkout request carries the method', () => {
  test('as an id and nothing else about payment', () => {
    const input = toPlaceOrderInput(cart(), null, 'pm-alice-ok');
    assert.equal(input.paymentMethodId, 'pm-alice-ok');
    assert.doesNotMatch(JSON.stringify(input), /token|card|description|number|expiry/i);
  });

  test('is refused without one, before anything is sent', () => {
    assert.throws(() => toPlaceOrderInput(cart(), null, ''), /payment method/);
    assert.throws(() => toPlaceOrderInput(cart(), null, '   '), /payment method/);
  });

  test('a different method is a different checkout: it needs a new idempotency key', () => {
    assert.notEqual(fingerprint(cart(), null, 'pm-alice-ok'), fingerprint(cart(), null, 'pm-alice-refused'));
    assert.equal(fingerprint(cart(), null, 'pm-alice-ok'), fingerprint(cart(), null, 'pm-alice-ok'));
  });
});
