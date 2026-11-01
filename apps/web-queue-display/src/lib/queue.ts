// The queue board's pure logic: which column an order belongs in, in what order, and which orders have just arrived. No React, so it is unit tested.

export interface QueueOrder {
  id: string;
  reference: string;
  status: string;
  placedAt?: string | null | undefined;
  updatedAt: string;
  pickupWindow?: { start: string; end: string } | null | undefined;
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

/** The ids in `current` that were not in `previous`: the orders that arrived since the last answer. */
export function newOrderIds(previous: ReadonlySet<string>, current: readonly string[]): string[] {
  return current.filter((id) => !previous.has(id));
}
