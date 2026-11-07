import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { actionsFor, OUTCOME_TEXT, STILL_WAITING_MS, STILL_WAITING_TEXT } from '../../src/lib/actions.ts';

describe('actionsFor', () => {
  test('offers what the vendor does next at each status', () => {
    assert.deepEqual(
      actionsFor('PLACED').map((a) => a.action),
      ['CONFIRM', 'DECLINE'],
    );
    assert.deepEqual(
      actionsFor('CONFIRMED').map((a) => a.action),
      ['START_PREPARATION', 'CANCEL'],
    );
    assert.deepEqual(
      actionsFor('IN_PREPARATION').map((a) => a.action),
      ['MARK_READY', 'CANCEL'],
    );
    assert.deepEqual(
      actionsFor('READY_FOR_FULFILLMENT').map((a) => a.action),
      ['COMPLETE', 'CANCEL'],
    );
  });

  test('a new order is declined, never cancelled, and an accepted one can be cancelled but not declined', () => {
    assert.ok(!actionsFor('PLACED').some((a) => a.action === 'CANCEL'));
    for (const status of ['CONFIRMED', 'IN_PREPARATION', 'READY_FOR_FULFILLMENT']) {
      assert.ok(
        actionsFor(status).some((a) => a.action === 'CANCEL'),
        status,
      );
      assert.ok(!actionsFor(status).some((a) => a.action === 'DECLINE'), status);
    }
  });

  test('offers nothing for a final status, a status it does not know, or an empty one', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'PENDING', 'MYSTERY', '']) assert.deepEqual(actionsFor(status), []);
  });

  test('only a decline and a cancel ask twice, because neither can be taken back', () => {
    const all = ['PLACED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_FULFILLMENT'].flatMap(actionsFor);
    assert.deepEqual([...new Set(all.filter((a) => a.confirmText).map((a) => a.action))], ['DECLINE', 'CANCEL']);
  });

  test('every outcome the vendor can meet has words, and none shows a code', () => {
    for (const text of Object.values(OUTCOME_TEXT))
      assert.doesNotMatch(text, /NOT_FOUND|NOT_ALLOWED|FORBIDDEN|INTERNAL|\d{3}/);
    assert.deepEqual(Object.keys(OUTCOME_TEXT).sort(), ['changed', 'failed', 'login-ended', 'missing']);
  });
});

describe('waiting for a hand-over', () => {
  test('the wait is long enough for a strategy to answer and short enough that a lost completion is no dead card', () => {
    assert.ok(STILL_WAITING_MS >= 5_000 && STILL_WAITING_MS <= 30_000);
    assert.doesNotMatch(STILL_WAITING_TEXT, /\d{3}|COMPLETE|READY_FOR/);
  });
});
