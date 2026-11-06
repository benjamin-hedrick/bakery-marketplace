import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLine,
  cartCount,
  EMPTY_CART,
  estimatedTotalCents,
  fingerprint,
  lineTotalCents,
  MAX_LINES,
  MAX_QUANTITY,
  parseCart,
  removeLine,
  setQuantity,
  toPlaceOrderInput,
  type Cart,
  type CartLine,
} from '../src/cart.ts';
import { createCartStore } from '../src/store.ts';

const seeds = { id: 'mod-seeds', name: 'Seed crust', priceDeltaCents: 100 };
const sliced = { id: 'mod-sliced', name: 'Sliced', priceDeltaCents: 0 };
const sourdough = (over: Partial<CartLine> = {}): CartLine => ({
  listingId: 'TGlzdGluZzpzb3VyZG91Z2g=',
  name: 'Country Sourdough',
  unitPriceCents: 800,
  currency: 'USD',
  modifiers: [],
  quantity: 1,
  maxPerOrder: 4,
  ...over,
});
const croissant = (over: Partial<CartLine> = {}): CartLine =>
  sourdough({
    listingId: 'TGlzdGluZzpjcm9pc3NhbnQ=',
    name: 'Almond Croissant',
    unitPriceCents: 450,
    maxPerOrder: null,
    ...over,
  });

function must(result: ReturnType<typeof addLine>): { cart: Cart; capped: boolean } {
  assert.ok('cart' in result, `expected the line to be added, got ${JSON.stringify(result)}`);
  return result;
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('adding to the cart', () => {
  test('the first line sets the vendor', () => {
    const { cart } = must(addLine(EMPTY_CART, 'vendor-shop-001', sourdough()));
    assert.equal(cart.vendorId, 'vendor-shop-001');
    assert.equal(cart.lines.length, 1);
  });

  test('the same item with the same options is one line, whatever order the options were chosen in', () => {
    let { cart } = must(addLine(EMPTY_CART, 'v', sourdough({ modifiers: [seeds, sliced], quantity: 1 })));
    ({ cart } = must(addLine(cart, 'v', sourdough({ modifiers: [sliced, seeds], quantity: 2 }))));
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0]!.quantity, 3);
  });

  test('a stored cart whose options are in another order still merges with the same choices', () => {
    const stored = parseCart({
      vendorId: 'v',
      lines: [{ ...sourdough({ modifiers: [seeds, sliced] }), modifiers: [seeds, sliced].reverse() }],
    });
    assert.ok(stored);
    const { cart } = must(addLine(stored, 'v', sourdough({ modifiers: [seeds, sliced], quantity: 2 })));
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0]!.quantity, 3);
  });

  test('the same item with different options is a different line', () => {
    let { cart } = must(addLine(EMPTY_CART, 'v', sourdough({ modifiers: [seeds] })));
    ({ cart } = must(addLine(cart, 'v', sourdough({ modifiers: [] }))));
    assert.equal(cart.lines.length, 2);
  });

  test('a quantity is capped at the per-order limit, and the caller is told it was capped', () => {
    let result = must(addLine(EMPTY_CART, 'v', sourdough({ quantity: 3 })));
    assert.equal(result.capped, false);
    result = must(addLine(result.cart, 'v', sourdough({ quantity: 3 })));
    assert.equal(result.cart.lines[0]!.quantity, 4);
    assert.equal(result.capped, true);
  });

  test('with no per-order limit the global maximum applies', () => {
    const { cart, capped } = must(addLine(EMPTY_CART, 'v', croissant({ quantity: 99 })));
    assert.equal(cart.lines[0]!.quantity, MAX_QUANTITY);
    assert.equal(capped, true);
  });

  test('an item from another vendor is refused and the cart is unchanged', () => {
    const { cart } = must(addLine(EMPTY_CART, 'vendor-a', sourdough()));
    assert.deepEqual(addLine(cart, 'vendor-b', croissant()), { error: 'other_vendor' });
  });

  test('a cart cannot grow past the line limit', () => {
    let cart: Cart = EMPTY_CART;
    for (let i = 0; i < MAX_LINES; i++) cart = must(addLine(cart, 'v', sourdough({ listingId: `item-${i}` }))).cart;
    assert.deepEqual(addLine(cart, 'v', sourdough({ listingId: 'one-more' })), { error: 'too_many_lines' });
    must(addLine(cart, 'v', sourdough({ listingId: 'item-0' }))); // but adding more of a line already there is fine
  });

  test('a quantity below one is not a line', () => {
    assert.deepEqual(addLine(EMPTY_CART, 'v', sourdough({ quantity: 0 })), { error: 'invalid_quantity' });
    assert.deepEqual(addLine(EMPTY_CART, 'v', sourdough({ quantity: 1.5 })), { error: 'invalid_quantity' });
  });

  test('adding never changes the cart it was given', () => {
    const before = structuredClone(EMPTY_CART);
    must(addLine(EMPTY_CART, 'v', sourdough()));
    assert.deepEqual(EMPTY_CART, before);
  });
});

describe('changing and removing lines', () => {
  const two = () =>
    must(addLine(must(addLine(EMPTY_CART, 'v', sourdough({ quantity: 2 }))).cart, 'v', croissant())).cart;

  test('setQuantity clamps between one and the limit', () => {
    assert.equal(setQuantity(two(), 0, 0).lines[0]!.quantity, 1);
    assert.equal(setQuantity(two(), 0, 99).lines[0]!.quantity, 4);
    assert.equal(setQuantity(two(), 1, 99).lines[1]!.quantity, MAX_QUANTITY);
    assert.equal(setQuantity(two(), 0, 3).lines[0]!.quantity, 3);
  });

  test('setQuantity on a line that is not there changes nothing', () => {
    assert.deepEqual(setQuantity(two(), 7, 3), two());
  });

  test('removing a line keeps the others; removing the last empties the cart and frees the vendor', () => {
    const cart = removeLine(two(), 0);
    assert.deepEqual(
      cart.lines.map((l) => l.name),
      ['Almond Croissant'],
    );
    assert.equal(cart.vendorId, 'v');
    assert.deepEqual(removeLine(cart, 0), EMPTY_CART);
  });
});

describe('totals (an estimate; the server prices the order)', () => {
  test('a line is (price + options) times quantity, in integer cents', () => {
    assert.equal(lineTotalCents(sourdough({ modifiers: [seeds, sliced], quantity: 2 })), (800 + 100 + 0) * 2);
  });

  test('the cart total and count add up the lines', () => {
    const cart = must(
      addLine(
        must(addLine(EMPTY_CART, 'v', sourdough({ modifiers: [seeds], quantity: 2 }))).cart,
        'v',
        croissant({ quantity: 3 }),
      ),
    ).cart;
    assert.equal(estimatedTotalCents(cart), 900 * 2 + 450 * 3);
    assert.equal(cartCount(cart), 5);
    assert.equal(estimatedTotalCents(EMPTY_CART), 0);
    assert.equal(cartCount(EMPTY_CART), 0);
  });
});

describe('what is sent to checkout', () => {
  const cart = () =>
    must(addLine(EMPTY_CART, 'vendor-shop-001', sourdough({ modifiers: [seeds, sliced], quantity: 2 }))).cart;

  test('carries only ids, options and quantities (never a price), with a window or none', () => {
    assert.deepEqual(toPlaceOrderInput(cart(), null, 'pm-ok'), {
      vendorId: 'vendor-shop-001',
      paymentMethodId: 'pm-ok',
      lineItems: [{ listingId: 'TGlzdGluZzpzb3VyZG91Z2g=', modifierIds: ['mod-seeds', 'mod-sliced'], quantity: 2 }],
      pickupWindow: null,
    });
    const window = { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' };
    assert.deepEqual(toPlaceOrderInput(cart(), window, 'pm-ok').pickupWindow, window);
    assert.doesNotMatch(JSON.stringify(toPlaceOrderInput(cart(), null, 'pm-ok')), /800|price|Cents/i);
  });

  test('the fingerprint is the same for the same content however it was built, and different when anything that is ordered differs', () => {
    const a = must(addLine(EMPTY_CART, 'v', sourdough({ modifiers: [seeds, sliced], quantity: 2 }))).cart;
    const b = must(addLine(EMPTY_CART, 'v', sourdough({ modifiers: [sliced, seeds], quantity: 2 }))).cart;
    assert.equal(fingerprint(a, null, 'pm-ok'), fingerprint(b, null, 'pm-ok'));
    assert.notEqual(fingerprint(a, null, 'pm-ok'), fingerprint(setQuantity(a, 0, 3), null, 'pm-ok'));
    assert.notEqual(fingerprint(a, null, 'pm-ok'), fingerprint(removeLine(a, 0), null, 'pm-ok'));
    assert.notEqual(fingerprint(a, null, 'pm-ok'), fingerprint(a, { start: 's', end: 'e' }, 'pm-ok'));
    assert.notEqual(
      fingerprint(a, { start: 's1', end: 'e' }, 'pm-ok'),
      fingerprint(a, { start: 's2', end: 'e' }, 'pm-ok'),
    );
  });

  test('a price shown to the customer is not part of the fingerprint (the same order is the same order)', () => {
    const a = must(addLine(EMPTY_CART, 'v', sourdough())).cart;
    const repriced = must(addLine(EMPTY_CART, 'v', sourdough({ unitPriceCents: 999 }))).cart;
    assert.equal(fingerprint(a, null, 'pm-ok'), fingerprint(repriced, null, 'pm-ok'));
  });
});

describe('reading a stored cart', () => {
  test('a cart that was written by this code reads back the same', () => {
    const cart = must(addLine(EMPTY_CART, 'v', sourdough({ modifiers: [seeds], quantity: 2 }))).cart;
    assert.deepEqual(parseCart(JSON.parse(JSON.stringify(cart))), cart);
  });

  test('anything that is not a well-formed cart is rejected, not repaired', () => {
    const good = JSON.parse(JSON.stringify(must(addLine(EMPTY_CART, 'v', sourdough())).cart));
    type Loose = { vendorId: unknown; lines: Record<string, unknown>[] };
    const broken = (patch: (c: Loose) => void) => {
      const c = structuredClone(good) as Loose;
      patch(c);
      return c;
    };
    for (const bad of [
      null,
      'cart',
      [],
      {},
      { vendorId: 'v' },
      broken((c) => (c.lines[0].quantity = 0)),
      broken((c) => (c.lines[0].quantity = 2.5)),
      broken((c) => (c.lines[0].quantity = 21)),
      broken((c) => (c.lines[0].unitPriceCents = -1)),
      broken((c) => (c.lines[0].unitPriceCents = '800')),
      broken((c) => delete c.lines[0].name),
      broken((c) => (c.lines[0].modifiers = [{ id: 1 }])),
      broken((c) => (c.vendorId = null)),
      broken((c) => (c.lines = Array.from({ length: MAX_LINES + 1 }, () => c.lines[0]))),
    ]) {
      assert.equal(parseCart(bad), null, JSON.stringify(bad));
    }
  });

  test('an empty cart is valid and has no vendor', () => {
    assert.deepEqual(parseCart({ vendorId: null, lines: [] }), EMPTY_CART);
    assert.equal(parseCart({ vendorId: 'v', lines: [] }), null);
  });
});

describe('the cart store', () => {
  test('starts empty, keeps changes, and tells subscribers', () => {
    const store = createCartStore(new MemoryStorage());
    let heard = 0;
    store.subscribe(() => heard++);
    assert.deepEqual(store.get(), EMPTY_CART);

    store.update((c) => must(addLine(c, 'v', sourdough())).cart);

    assert.equal(store.get().lines.length, 1);
    assert.equal(heard, 1);
  });

  test('survives a page navigation: a new store over the same storage sees the cart', () => {
    const storage = new MemoryStorage();
    createCartStore(storage).update((c) => must(addLine(c, 'v', sourdough({ quantity: 2 }))).cart);
    assert.equal(createCartStore(storage).get().lines[0]!.quantity, 2);
  });

  test('unreadable stored data is ignored and does not stop the store working', () => {
    const storage = new MemoryStorage();
    storage.setItem('bakery.cart', '{not json');
    const store = createCartStore(storage);
    assert.deepEqual(store.get(), EMPTY_CART);
    store.update((c) => must(addLine(c, 'v', sourdough())).cart);
    assert.equal(store.get().lines.length, 1);
  });

  test('storage that throws (a blocked or full browser store) leaves a working in-memory cart', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createCartStore(hostile);
    store.update((c) => must(addLine(c, 'v', sourdough())).cart);
    assert.equal(store.get().lines.length, 1);
    store.clear();
    assert.deepEqual(store.get(), EMPTY_CART);
  });

  test('no storage at all (the server) is an always-empty cart that ignores writes without failing', () => {
    const store = createCartStore(null);
    assert.deepEqual(store.get(), EMPTY_CART);
    store.update((c) => must(addLine(c, 'v', sourdough())).cart);
    assert.equal(store.get().lines.length, 1); // in memory, for the life of the page
  });

  test('clear empties the cart and the stored copy; the snapshot is the same object until something changes', () => {
    const storage = new MemoryStorage();
    const store = createCartStore(storage);
    store.update((c) => must(addLine(c, 'v', sourdough())).cart);
    const first = store.get();
    assert.equal(store.get(), first);
    store.clear();
    assert.deepEqual(store.get(), EMPTY_CART);
    assert.equal(storage.getItem('bakery.cart'), null);
  });

  test('an update that changes nothing does not notify', () => {
    const store = createCartStore(new MemoryStorage());
    let heard = 0;
    store.subscribe(() => heard++);
    store.update((c) => c);
    assert.equal(heard, 0);
  });
});
