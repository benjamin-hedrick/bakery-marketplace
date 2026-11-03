import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { groupOrders, mergeFetched, newOrderIds, type QueueOrder } from '../../src/lib/queue.ts';

const order = (id: string, status: string, placedAt: string | null = '2026-11-02T13:00:00+00:00'): QueueOrder => ({
  id,
  reference: id.toUpperCase(),
  status,
  placedAt,
  updatedAt: '2026-11-02T13:30:00+00:00',
  pickupWindow: null,
});

describe('groupOrders', () => {
  test('always gives the three columns in the same order, even when they are empty', () => {
    const columns = groupOrders([]);

    assert.deepEqual(
      columns.map((c) => [c.key, c.title, c.orders.length]),
      [
        ['new', 'New', 0],
        ['preparing', 'Preparing', 0],
        ['ready', 'Ready', 0],
      ],
    );
  });

  test('puts each status in its column, with confirmed and in preparation together', () => {
    const columns = groupOrders([
      order('a', 'PLACED'),
      order('b', 'CONFIRMED'),
      order('c', 'IN_PREPARATION'),
      order('d', 'READY_FOR_FULFILLMENT'),
    ]);

    assert.deepEqual(
      columns.map((c) => c.orders.map((o) => o.id)),
      [['a'], ['b', 'c'], ['d']],
    );
  });

  test('shows nothing for a finished, cancelled or unknown status', () => {
    const columns = groupOrders([
      order('a', 'COMPLETED'),
      order('b', 'CANCELLED'),
      order('c', 'PENDING'),
      order('d', 'SOMETHING_NEW'),
    ]);

    assert.deepEqual(
      columns.map((c) => c.orders.length),
      [0, 0, 0],
    );
  });

  test('the oldest order is first in its column, and the id breaks a tie so the order is stable', () => {
    const columns = groupOrders([
      order('late', 'PLACED', '2026-11-02T13:20:00+00:00'),
      order('early', 'PLACED', '2026-11-02T13:05:00+00:00'),
      order('tie-b', 'PLACED', '2026-11-02T13:10:00+00:00'),
      order('tie-a', 'PLACED', '2026-11-02T13:10:00+00:00'),
    ]);

    assert.deepEqual(
      columns[0]!.orders.map((o) => o.id),
      ['early', 'tie-a', 'tie-b', 'late'],
    );
  });

  test('an order with no placed time is placed by its last change', () => {
    const columns = groupOrders([order('b', 'PLACED', '2026-11-02T13:40:00+00:00'), order('a', 'PLACED', null)]);

    assert.deepEqual(
      columns[0]!.orders.map((o) => o.id),
      ['a', 'b'],
    ); // a: 13:30 (its updatedAt), b: 13:40
  });

  test('does not change the list it was given', () => {
    const input = [
      order('b', 'PLACED', '2026-11-02T13:20:00+00:00'),
      order('a', 'PLACED', '2026-11-02T13:05:00+00:00'),
    ];

    groupOrders(input);

    assert.deepEqual(
      input.map((o) => o.id),
      ['b', 'a'],
    );
  });
});

describe('newOrderIds', () => {
  test('is the ids that were not there before, in the order they came', () => {
    assert.deepEqual(newOrderIds(new Set(['a', 'b']), ['c', 'a', 'd']), ['c', 'd']);
  });

  test('is empty when nothing arrived, and an order that left and came back counts as new again', () => {
    assert.deepEqual(newOrderIds(new Set(['a']), ['a']), []);
    assert.deepEqual(newOrderIds(new Set(), ['a']), ['a']);
  });
});

describe('mergeFetched (register item 133)', () => {
  const o = (id: string, status: string, sequence?: number): QueueOrder => ({ ...order(id, status), sequence });
  const never = () => false;
  const ids = (list: QueueOrder[]) => list.map((x) => `${x.id}:${x.status}:${x.sequence}`).sort();

  test('a fetched list that is older than a pushed change does not undo it', () => {
    const merged = mergeFetched([o('a', 'CONFIRMED', 3)], [o('a', 'PLACED', 2)], never);
    assert.deepEqual(ids(merged), ['a:CONFIRMED:3']);
  });

  test('a fetched order that is newer than the one on the screen replaces it', () => {
    assert.deepEqual(ids(mergeFetched([o('a', 'PLACED', 2)], [o('a', 'CONFIRMED', 3)], never)), ['a:CONFIRMED:3']);
  });

  test('the same sequence takes the fetched order, and a missing sequence on either side takes the fetched order', () => {
    assert.deepEqual(ids(mergeFetched([o('a', 'PLACED', 2)], [o('a', 'PLACED', 2)], never)), ['a:PLACED:2']);
    assert.deepEqual(ids(mergeFetched([o('a', 'PLACED')], [o('a', 'CONFIRMED', 3)], never)), ['a:CONFIRMED:3']);
    assert.deepEqual(ids(mergeFetched([o('a', 'CONFIRMED', 3)], [o('a', 'PLACED')], never)), ['a:PLACED:undefined']);
  });

  test('an order only in the fetched list is added, unless a push about it arrived during the fetch', () => {
    assert.deepEqual(ids(mergeFetched([], [o('b', 'PLACED', 1)], never)), ['b:PLACED:1']);
    // pushed as completed during the fetch, so the screen no longer holds it: the older list must not bring it back
    assert.deepEqual(ids(mergeFetched([], [o('b', 'READY_FOR_FULFILLMENT', 4)], (id) => id === 'b')), []);
  });

  test('an order only on the screen is dropped (the list is the authority), unless a push about it arrived during the fetch', () => {
    assert.deepEqual(ids(mergeFetched([o('c', 'PLACED', 1)], [], never)), []);
    assert.deepEqual(ids(mergeFetched([o('c', 'PLACED', 1)], [], (id) => id === 'c')), ['c:PLACED:1']);
  });

  test('does not change the lists it was given', () => {
    const held = [o('a', 'CONFIRMED', 3)];
    const fetched = [o('a', 'PLACED', 2), o('b', 'PLACED', 1)];
    mergeFetched(held, fetched, never);
    assert.deepEqual(ids(held), ['a:CONFIRMED:3']);
    assert.deepEqual(ids(fetched), ['a:PLACED:2', 'b:PLACED:1']);
  });
});
