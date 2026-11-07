// WI-CUST-009: the app asks for the listing's stock again when an item is added to the order, and turns the answer into what customer-core decides on.
import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAdd } from '@bakery/customer-core';
import { fakeFetch } from './helpers.ts';
import { readFreshStock } from '../src/stock.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

const listing = (status: string, maxPerOrder: number | null) => ({
  status: 200,
  json: { data: { listing: { id: 'TGlzdGluZzp4', stock: { status, maxPerOrder } } } },
});

describe('readFreshStock', () => {
  test('asks the BFF for the listing by its id, without a login (the read is public)', async () => {
    const calls = fakeFetch(() => listing('IN_STOCK', 4));

    await readFreshStock('TGlzdGluZzp4');

    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0]!.body) as { query: string; variables: { id: string } };
    assert.deepEqual(body.variables, { id: 'TGlzdGluZzp4' });
    assert.match(body.query, /stock \{ status maxPerOrder \}/);
    assert.equal(calls[0]!.headers['authorization'], undefined);
  });

  test('a listing in stock or low can be added, with the fresh limit', async () => {
    fakeFetch(() => listing('LOW', 2));
    assert.deepEqual(decideAdd(await readFreshStock('x')), { allowed: true, maxPerOrder: 2 });
  });

  test('a listing that sold out is refused as sold out', async () => {
    fakeFetch(() => listing('SOLD_OUT', null));
    assert.deepEqual(decideAdd(await readFreshStock('x')), { allowed: false, refusal: 'sold_out' });
  });

  test('a listing that is no longer public is refused as missing', async () => {
    fakeFetch(() => ({ status: 200, json: { data: { listing: null } } }));
    assert.deepEqual(decideAdd(await readFreshStock('x')), { allowed: false, refusal: 'missing' });
  });

  test('a read that fails, by the network or by the service, adds nothing and says the check could not be made', async () => {
    fakeFetch(() => new Error('network down'));
    assert.deepEqual(decideAdd(await readFreshStock('x')), { allowed: false, refusal: 'check_failed' });

    fakeFetch(() => ({ status: 500, json: {} }));
    assert.deepEqual(decideAdd(await readFreshStock('x')), { allowed: false, refusal: 'check_failed' });

    fakeFetch(() => ({ status: 200, json: { errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }] } }));
    assert.deepEqual(decideAdd(await readFreshStock('x')), { allowed: false, refusal: 'check_failed' });
  });
});
