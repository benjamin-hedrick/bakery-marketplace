// The queue board's pure logic: which column an order belongs in, in what order, and which orders have just arrived. No React, so it is unit tested.

export interface QueueOrder {
  id: string;
  reference: string;
  status: string;
  placedAt?: string | null | undefined;
  updatedAt: string;
  pickupWindow?: { start: string; end: string } | null | undefined;
  /** The highest event sequence applied to the order. A pushed change replaces what the screen holds only if this is higher. */
  sequence?: number | undefined;
  /** The allergens the customer told the bakery about for this order (registry ids, WI-ORD-009). Empty or absent when none. */
  allergens?: readonly string[] | undefined;
}

export interface Column<T extends QueueOrder> {
  key: 'new' | 'preparing' | 'ready';
  title: string;
  orders: T[];
}

// Display words for the status groups. The status itself comes from ordering-service; only the grouping is decided here, and it is a
// presentation choice (what the kitchen does next), not an order rule.
const COLUMN_OF: Record<string, Column<QueueOrder>['key']> = {
  PLACED: 'new',
  CONFIRMED: 'preparing',
  IN_PREPARATION: 'preparing',
  READY_FOR_FULFILLMENT: 'ready',
};

const TITLES: Record<Column<QueueOrder>['key'], string> = {
  new: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
};

const placedTime = (o: QueueOrder) => Date.parse(o.placedAt ?? o.updatedAt);

/**
 * The three columns, always in the same order and always present (an empty column is still a column, so the screen does not jump when the
 * last order leaves it). Within a column the oldest order comes first, because the oldest waits longest. Orders in any other status (completed,
 * cancelled, or one this screen does not know) are not shown.
 */
export function groupOrders<T extends QueueOrder>(orders: readonly T[]): Column<T>[] {
  const columns: Column<T>[] = (['new', 'preparing', 'ready'] as const).map((key) => ({
    key,
    title: TITLES[key],
    orders: [],
  }));
  for (const order of orders) {
    const key = COLUMN_OF[order.status];
    if (key) columns.find((c) => c.key === key)!.orders.push(order);
  }
  for (const column of columns) column.orders.sort((a, b) => placedTime(a) - placedTime(b) || a.id.localeCompare(b.id));
  return columns;
}

/**
 * What the card says about an order's allergens (WI-QUE-005), or null when the customer named none: an order without allergens says nothing, because
 * "no allergies" would claim more than the screen knows. Labels come from the public registry; an id it does not know is shown as itself, never dropped.
 */
export function allergenText(
  ids: readonly string[] | null | undefined,
  labels: ReadonlyMap<string, string>,
): string | null {
  if (!ids || ids.length === 0) return null;
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  return `Allergy: ${ids.map((id) => lower(labels.get(id) ?? id)).join(', ')}`;
}

/** The ids in `current` that were not in `previous`: the orders that arrived since the last answer. */
export function newOrderIds(previous: ReadonlySet<string>, current: readonly string[]): string[] {
  return current.filter((id) => !previous.has(id));
}

/**
 * The list with one pushed change applied (ADR-0021). The change replaces the order the screen holds only if its sequence is higher, so a late or
 * repeated update never moves an order backwards; an order the screen did not hold is added; one that is no longer shown (completed, cancelled) is
 * removed. If nothing changes, the same list is returned, so the screen does not draw again.
 */
export function applyChange<T extends QueueOrder>(orders: readonly T[], change: T): T[] {
  const index = orders.findIndex((o) => o.id === change.id);
  const held = index >= 0 ? orders[index]! : undefined;
  if (held && change.sequence !== undefined && held.sequence !== undefined && held.sequence >= change.sequence) {
    return orders as T[];
  }
  const shown = change.status in COLUMN_OF;
  if (!shown) return held ? orders.filter((o) => o.id !== change.id) : (orders as T[]);
  if (!held) return [change, ...orders];
  return orders.map((o) => (o.id === change.id ? change : o));
}

/**
 * A fetched list put on top of what the screen already holds (register item 133). A list read can start before a pushed change and end after
 * it, and ordering's read model may be behind the stream, so the fetched list is not simply the truth:
 * - an order in both: the one with the higher sequence stays (a fetched order with no sequence, or a held one with none, takes the fetched);
 * - an order only in the fetched list: added, unless a push about it arrived while the fetch was running (the screen already decided about it,
 *   for example removed it because it completed);
 * - an order only on the screen: kept if a push about it arrived while the fetch was running, otherwise dropped (the list is the authority on
 *   which orders are in progress).
 * `pushedDuringFetch(id)` says whether a push about that order arrived after the fetch began.
 */
export function mergeFetched<T extends QueueOrder>(
  held: readonly T[],
  fetched: readonly T[],
  pushedDuringFetch: (id: string) => boolean,
): T[] {
  const heldById = new Map(held.map((o) => [o.id, o] as const));
  const merged: T[] = [];
  for (const f of fetched) {
    const h = heldById.get(f.id);
    if (h) {
      const heldIsNewer = h.sequence !== undefined && f.sequence !== undefined && h.sequence > f.sequence;
      merged.push(heldIsNewer ? h : f);
    } else if (!pushedDuringFetch(f.id)) {
      merged.push(f);
    }
  }
  const fetchedIds = new Set(fetched.map((o) => o.id));
  for (const h of held) if (!fetchedIds.has(h.id) && pushedDuringFetch(h.id)) merged.push(h);
  return merged;
}
