import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { groupOrders, newOrderIds, type QueueOrder } from '../../src/lib/queue.ts';

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
