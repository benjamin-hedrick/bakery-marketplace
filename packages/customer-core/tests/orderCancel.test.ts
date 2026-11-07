import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CANCEL_OUTCOME_TEXT, CANCEL_QUESTION, customerMayCancel, type CancelOutcome } from '../src/orderCancel.ts';

// A customer may cancel while the order is placed or confirmed; ordering-service decides, this only decides whether to show the button.

describe('customerMayCancel', () => {
  test('a new order and an accepted one can be cancelled', () => {
    assert.equal(customerMayCancel('PLACED'), true);
    assert.equal(customerMayCancel('CONFIRMED'), true);
  });

  test('once the bakery has started, an order is ready, finished or already cancelled there is no button', () => {
    for (const status of ['IN_PREPARATION', 'READY_FOR_FULFILLMENT', 'COMPLETED', 'CANCELLED', 'PENDING']) {
      assert.equal(customerMayCancel(status), false, status);
    }
  });

  test('a status this code does not know offers no button, not a guess', () => {
    assert.equal(customerMayCancel('%future added value'), false);
    assert.equal(customerMayCancel(''), false);
  });
});

describe('the words', () => {
  test('every outcome has plain words, with no codes in them', () => {
    const all: CancelOutcome[] = ['cancelled', 'not_allowed_now', 'missing', 'failed'];
    for (const outcome of all) assert.doesNotMatch(CANCEL_OUTCOME_TEXT[outcome], /[A-Z_]{5,}/, outcome);
  });

  test('a failed cancel says the order has not changed', () => {
    assert.match(CANCEL_OUTCOME_TEXT.failed, /not changed/);
  });

  test('the question asks before anything is sent', () => {
    assert.match(CANCEL_QUESTION, /\?$/);
  });
});
