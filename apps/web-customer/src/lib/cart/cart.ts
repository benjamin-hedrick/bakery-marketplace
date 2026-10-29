// The customer's order while it is being built (first-slice contract D-2: a browser cart; the cart is conceptually the Pending order).
// Everything here is an estimate or a hint: ordering-service reads the real prices from the catalog, enforces every limit, and decides
// whether the order can be placed. The cart holds what to ask for (ids, options, quantities) plus what was shown, so it can be shown again.

export const MAX_LINES = 10; // placeholders mirroring ordering-service's OrderRules (D-5); the server is the authority
export const MAX_QUANTITY = 20;

export interface CartModifier {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface CartLine {
  /** A Listing global id, exactly as the BFF gave it. */
  listingId: string;
  name: string;
  unitPriceCents: number;
  currency: string;
  /** Sorted by id, so the same choices are the same line. */
  modifiers: CartModifier[];
  quantity: number;
  maxPerOrder: number | null;
}

export interface Cart {
  vendorId: string | null;
  lines: CartLine[];
}

export const EMPTY_CART: Cart = Object.freeze({ vendorId: null, lines: Object.freeze([]) as unknown as CartLine[] });

export type AddError = 'invalid_quantity' | 'other_vendor' | 'too_many_lines';
export type AddResult = { cart: Cart; capped: boolean } | { error: AddError };

const limit = (maxPerOrder: number | null) => Math.min(MAX_QUANTITY, maxPerOrder ?? MAX_QUANTITY);
const byId = (a: CartModifier, b: CartModifier) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const optionsKey = (l: CartLine) =>
  l.modifiers
    .map((m) => m.id)
    .sort()
    .join(',');
const sameLine = (a: CartLine, b: CartLine) => a.listingId === b.listingId && optionsKey(a) === optionsKey(b);

/** Adds a line, merging it into an identical one. Never changes the cart it is given. */
export function addLine(cart: Cart, vendorId: string, line: CartLine): AddResult {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) return { error: 'invalid_quantity' };
  if (cart.vendorId !== null && cart.vendorId !== vendorId) return { error: 'other_vendor' };

  const incoming: CartLine = { ...line, modifiers: [...line.modifiers].sort(byId) };
  const cap = limit(incoming.maxPerOrder);
  const at = cart.lines.findIndex((l) => sameLine(l, incoming));

  if (at >= 0) {
    const wanted = cart.lines[at]!.quantity + incoming.quantity;
    const lines = cart.lines.map((l, i) => (i === at ? { ...incoming, quantity: Math.min(wanted, cap) } : l));
    return { cart: { vendorId, lines }, capped: wanted > cap };
  }
  if (cart.lines.length >= MAX_LINES) return { error: 'too_many_lines' };
  return {
    cart: { vendorId, lines: [...cart.lines, { ...incoming, quantity: Math.min(incoming.quantity, cap) }] },
    capped: incoming.quantity > cap,
  };
}

export function setQuantity(cart: Cart, index: number, quantity: number): Cart {
  const line = cart.lines[index];
  if (!line) return cart;
  const clamped = Math.min(Math.max(Math.trunc(quantity) || 1, 1), limit(line.maxPerOrder));
  return { ...cart, lines: cart.lines.map((l, i) => (i === index ? { ...l, quantity: clamped } : l)) };
}

export function removeLine(cart: Cart, index: number): Cart {
  const lines = cart.lines.filter((_, i) => i !== index);
  return lines.length === 0 ? EMPTY_CART : { ...cart, lines };
}

// ---- totals: an estimate for display ---------------------------------------------------------------------------------------

export const lineUnitCents = (l: CartLine) =>
  l.unitPriceCents + l.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
export const lineTotalCents = (l: CartLine) => lineUnitCents(l) * l.quantity;
export const estimatedTotalCents = (cart: Cart) => cart.lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
export const cartCount = (cart: Cart) => cart.lines.reduce((sum, l) => sum + l.quantity, 0);

// ---- what is sent ---------------------------------------------------------------------------------------------------------

export interface WindowInput {
  start: string;
  end: string;
}

/** The checkout request: ids, options and quantities only. There is no price, total, customer or status to send (ADR-0013). */
export function toPlaceOrderInput(cart: Cart, pickupWindow: WindowInput | null) {
  if (cart.vendorId === null || cart.lines.length === 0) throw new Error('There is nothing to order.');
  return {
    vendorId: cart.vendorId,
    lineItems: cart.lines.map((l) => ({
      listingId: l.listingId,
      modifierIds: l.modifiers.map((m) => m.id).sort(),
      quantity: l.quantity,
    })),
    pickupWindow,
  };
}

/**
 * Identifies the content of a checkout. An idempotency key is tied to one content (the same key with different content is refused,
 * first-slice contract D-6), so a new key is needed exactly when this changes. Prices are deliberately not part of it.
 */
export function fingerprint(cart: Cart, pickupWindow: WindowInput | null): string {
  return JSON.stringify([
    cart.vendorId,
    cart.lines.map((l) => [l.listingId, l.modifiers.map((m) => m.id).sort(), l.quantity]),
    pickupWindow ? [pickupWindow.start, pickupWindow.end] : null,
  ]);
}

// ---- reading a stored cart ------------------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';
const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function parseLine(v: unknown): CartLine | null {
  if (!isObject(v)) return null;
  const { listingId, name, unitPriceCents, currency, modifiers, quantity, maxPerOrder } = v;
  if (!isText(listingId) || listingId === '' || !isText(name) || !isText(currency) || !isCents(unitPriceCents))
    return null;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
    return null;
  if (maxPerOrder !== null && (typeof maxPerOrder !== 'number' || !Number.isInteger(maxPerOrder) || maxPerOrder < 1))
    return null;
  if (!Array.isArray(modifiers)) return null;
  const mods: CartModifier[] = [];
  for (const m of modifiers) {
    if (
      !isObject(m) ||
      !isText(m.id) ||
      !isText(m.name) ||
      typeof m.priceDeltaCents !== 'number' ||
      !Number.isInteger(m.priceDeltaCents)
    )
      return null;
    mods.push({ id: m.id, name: m.name, priceDeltaCents: m.priceDeltaCents });
  }
  return { listingId, name, unitPriceCents, currency, modifiers: mods, quantity, maxPerOrder };
}

/** A stored cart read back, or null if it is not exactly what this code writes. Rejected, never repaired: it is only a convenience. */
export function parseCart(value: unknown): Cart | null {
  if (!isObject(value) || !Array.isArray(value.lines) || value.lines.length > MAX_LINES) return null;
  const { vendorId } = value;
  if (value.lines.length === 0) return vendorId === null ? EMPTY_CART : null;
  if (!isText(vendorId) || vendorId === '') return null;
  const lines: CartLine[] = [];
  for (const l of value.lines) {
    const line = parseLine(l);
    if (line === null) return null;
    lines.push(line);
  }
  return { vendorId, lines };
}
