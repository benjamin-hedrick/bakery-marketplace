import { useSyncExternalStore } from 'react';
import { EMPTY_CART, type Cart } from './cart.ts';
import { createCartStore } from './store.ts';

function browserStorage(): Storage | null {
  try {
    return window.sessionStorage; // reading it can throw in some privacy modes
  } catch {
    return null;
  }
}

/** This tab's cart. On the server it is a store with no storage: always empty, and never written to (nothing there handles a click). */
export const cartStore = createCartStore(typeof window === 'undefined' ? null : browserStorage());

/** The cart, for display. The server and the first client render both see an empty cart, so hydration always agrees. */
export function useCart(): Cart {
  return useSyncExternalStore(cartStore.subscribe, cartStore.get, () => EMPTY_CART);
}
