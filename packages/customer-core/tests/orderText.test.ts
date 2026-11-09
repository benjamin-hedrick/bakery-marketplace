import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { referenceOf } from '../src/orderText.ts';

const globalId = (type: string, id: string) => Buffer.from(`${type}:${id}`).toString('base64');

describe('referenceOf', () => {
  test('is the last six characters of the service id, upper case: the vendor queue and the e-mails show the same', () => {
    assert.equal(referenceOf(globalId('Order', '3f2a9c1e-77ab-4d10-9a55-0c6e5b1d2f48')), '1D2F48');
  });

  test('keeps a short id whole', () => {
    assert.equal(referenceOf(globalId('Order', 'ab12')), 'AB12');
  });

  test('uses the text itself when it is not a global id', () => {
    assert.equal(referenceOf('plain-order-abc123'), 'ABC123');
  });
});
