// The fresh stock check when a customer adds an item to the order (WI-CUST-009). A page can show an item as in stock after it has sold out (a stored
// answer, an open tab), so adding to the order reads the listing again first and decides from that. This is advice to the customer: nothing is held
// for a cart, and checkout's atomic reservation in the catalog (ADR-0017) is still the authority. Pure, and shared by the web app and the Android app.

/** What the BFF says about an item's availability: a status, never a count (ADR-0017), and the most one order may hold (null: no limit). */
export interface FreshStock {
  status: string;
  maxPerOrder: number | null | undefined;
}

/** The result of asking for the listing again: its stock, "no longer public", or the read did not work. */
export type FreshStockRead = { kind: 'listing'; stock: FreshStock } | { kind: 'missing' } | { kind: 'failed' };

export type AddRefusal = 'sold_out' | 'unavailable' | 'missing' | 'check_failed';

export type AddDecision = { allowed: true; maxPerOrder: number | null } | { allowed: false; refusal: AddRefusal };

/**
 * Whether the item may be added now, and the limit per order to hold it to. Only IN_STOCK and LOW can be added; a status this code does not know is
 * treated as unavailable, not guessed to be fine. When the read failed nothing is added: the customer is told and may try again (the lead's decision,
 * 2026-11-07), so an item the customer could not be told about is never put in the order silently.
 */
export function decideAdd(read: FreshStockRead): AddDecision {
  if (read.kind === 'failed') return { allowed: false, refusal: 'check_failed' };
  if (read.kind === 'missing') return { allowed: false, refusal: 'missing' };
  const { status, maxPerOrder } = read.stock;
  if (status === 'SOLD_OUT') return { allowed: false, refusal: 'sold_out' };
  if (status !== 'IN_STOCK' && status !== 'LOW') return { allowed: false, refusal: 'unavailable' };
  return { allowed: true, maxPerOrder: maxPerOrder ?? null };
}

/** What the customer is told when an item was not added, in plain words. */
export const ADD_REFUSAL_TEXT: Record<AddRefusal, string> = {
  sold_out: 'This item has just sold out, so it was not added to your order.',
  unavailable: 'This item cannot be ordered right now, so it was not added to your order.',
  missing: 'This item is no longer available, so it was not added to your order.',
  check_failed: 'We could not check that this item is still in stock, so it was not added. Please try again.',
};
