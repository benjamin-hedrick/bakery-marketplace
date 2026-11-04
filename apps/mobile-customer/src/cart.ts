// The cart for this run of the app: the shared store from @bakery/customer-core, with no storage. Order and cart data is not kept on the device
// beyond the running session (ADR-0014, ADR-0023).
import { createCartStore, EMPTY_CART, type Cart } from '@bakery/customer-core';
import { useSyncExternalStore } from 'react';

export const cartStore = createCartStore(null);

export function useCart(): Cart {
  return useSyncExternalStore(cartStore.subscribe, cartStore.get, () => EMPTY_CART);
}
