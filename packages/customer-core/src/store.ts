import { EMPTY_CART, parseCart, type Cart } from './cart.ts';

const KEY = 'bakery.cart';

type CartStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface CartStore {
  /** The same object until the cart changes, so it suits `useSyncExternalStore`. */
  get(): Cart;
  /** Replaces the cart with `change(current)`. Returning the same object is a no-op. */
  update(change: (current: Cart) => Cart): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * The cart lives in `sessionStorage`: logging in is a full page navigation to the issuer and back, which would lose an in-memory cart, and
 * the cart holds nothing sensitive (item ids, options, quantities). If storage is missing or refuses (a private window, a full store) the cart
 * still works in memory for the life of the page; a stored value that is not exactly what this code writes is ignored.
 */
export function createCartStore(storage: CartStorage | null): CartStore {
  let current: Cart | undefined;
  const listeners = new Set<() => void>();

  function load(): Cart {
    try {
      const raw = storage?.getItem(KEY);
      return (raw ? parseCart(JSON.parse(raw)) : null) ?? EMPTY_CART;
    } catch {
      return EMPTY_CART;
    }
  }

  function persist(cart: Cart) {
    try {
      if (cart.lines.length === 0) storage?.removeItem(KEY);
      else storage?.setItem(KEY, JSON.stringify(cart));
    } catch {
      // storage refused: the in-memory cart is still right for this page
    }
  }

  const store: CartStore = {
    get: () => (current ??= load()),
    update(change) {
      const next = change(store.get());
      if (next === current) return;
      current = next;
      persist(next);
      listeners.forEach((l) => l());
    },
    clear: () => store.update(() => EMPTY_CART),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}
