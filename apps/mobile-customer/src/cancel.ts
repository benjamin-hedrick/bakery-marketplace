import type { CancelOutcome } from '@bakery/customer-core';
import { gql } from './api';
import { CANCEL_ORDER, type CancelOrderData } from './queries';

type Call = typeof gql;

/**
 * The customer cancels their own order (ORD-011). Ordering decides whether they may (their own order, placed or confirmed); this only turns the BFF's answer
 * into the four outcomes the screen has words for. A failure of any kind is "failed": nothing is known to have changed, so the screen says so. `call` is
 * `gql` unless a test passes its own.
 */
export async function cancelOrder(orderId: string, call: Call = gql): Promise<CancelOutcome> {
  try {
    const data = await call<CancelOrderData>(CANCEL_ORDER, { input: { orderId } }, { authenticated: true });
    const result = data.cancelOrder;
    if (result.__typename === 'CancelOrderDone') return 'cancelled';
    return result.code === 'NOT_FOUND' ? 'missing' : 'not_allowed_now';
  } catch {
    return 'failed';
  }
}
