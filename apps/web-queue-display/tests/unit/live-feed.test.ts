import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { backoffMs, LiveFeed, type Mode, type StreamHandlers } from '../../src/lib/live-feed.ts';
import { applyChange, type QueueOrder } from '../../src/lib/queue.ts';

// The rules of the live feed (ADR-0021 decision 7), with a fake clock: when it is live, when it polls, when it reconnects, when it gives up.

type Change = { id: string; sequence: number };
class Fatal extends Error {}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function rig(options: { listDelay?: boolean } = {}) {
  const seen = {
    modes: [] as Mode[],
    applied: [] as Change[],
    lists: 0,
    fatal: [] as unknown[],
    streams: [] as { handlers: StreamHandlers<Change>; closed: boolean }[],
  };
  const pendingLists: (() => void)[] = [];
  const feed = new LiveFeed<Change>({
    openStream: (handlers) => {
      const stream = { handlers, closed: false };
      seen.streams.push(stream);
      return () => {
        stream.closed = true;
      };
    },
    refreshList: () => {
      seen.lists++;
      return options.listDelay ? new Promise<void>((resolve) => pendingLists.push(resolve)) : Promise.resolve();
    },
    applyChange: (c) => seen.applied.push(c),
    onMode: (m) => seen.modes.push(m),
    isFatal: (e) => e instanceof Fatal,
    onFatal: (e) => seen.fatal.push(e),
    now: () => Date.now(),
    random: () => 0.5, // no spread: the delays are exactly 1, 2, 4 ... seconds
  });
  const last = () => seen.streams.at(-1)!;
  return { feed, seen, last, releaseList: () => pendingLists.shift()?.() };
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => mock.timers.reset());

describe('backoffMs', () => {
  test('doubles from one second to a cap of thirty, spread by at most 20% either way', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffMs(n, () => 0.5)),
      [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000],
    );
    assert.equal(
      backoffMs(3, () => 0),
      3200,
    );
    assert.equal(
      backoffMs(3, () => 1),
      4800,
    );
  });
});

describe('the live feed', () => {
  test('asks for the list at once and opens a stream; it is live when the stream is open, and then asks for the list only every 60 seconds', async () => {
    const { feed, seen, last } = rig();

    feed.start();
    await flush();
    assert.equal(seen.lists, 1);
    assert.equal(seen.streams.length, 1);
    assert.deepEqual(seen.modes, []); // still connecting

    last().handlers.onOpen();
    await flush();
    assert.deepEqual(seen.modes, ['live']);
    assert.equal(seen.lists, 2); // after the stream opened, so nothing in between is missed

    for (let elapsed = 0; elapsed < 50_000; elapsed += 10_000) {
      mock.timers.tick(10_000);
      last().handlers.onActivity(); // the stream's heartbeat keeps it alive
    }
    await flush();
    assert.equal(seen.lists, 2); // not every 7 seconds
    mock.timers.tick(10_000);
    await flush();
    assert.equal(seen.lists, 3); // the consistency check, 60 seconds after the stream opened
    assert.equal(feed.currentMode, 'live');
    feed.stop();
  });

  test('while the stream is not up it asks every 7 seconds, and it retries after 1, 2, 4 seconds', async () => {
    const { feed, seen, last } = rig();
    feed.start();
    await flush();

    last().handlers.onError(new Error('refused'));
    await flush();
    assert.deepEqual(seen.modes, ['polling']);
    const lists = seen.lists;

    mock.timers.tick(7000);
    await flush();
    assert.equal(seen.lists, lists + 1);

    // The first retry came after 1 second (while the 7 seconds ran), a failing second after 2, a third after 4.
    assert.equal(seen.streams.length, 2);
    last().handlers.onError(new Error('refused again'));
    mock.timers.tick(1999);
    assert.equal(seen.streams.length, 2);
    mock.timers.tick(1);
    assert.equal(seen.streams.length, 3);
    last().handlers.onError(new Error('and again'));
    mock.timers.tick(3999);
    assert.equal(seen.streams.length, 3);
    mock.timers.tick(1);
    assert.equal(seen.streams.length, 4);
    feed.stop();
  });

  test('a stream that ends after a healthy life is re-opened at once, with the retry delay reset', async () => {
    const { feed, seen, last } = rig();
    feed.start();
    last().handlers.onOpen();
    await flush();
    mock.timers.tick(30_000);

    last().handlers.onComplete(); // the token expired
    mock.timers.tick(0);

    assert.equal(seen.streams.length, 2);
    assert.equal(seen.streams[0]!.closed, true);
    last().handlers.onOpen();
    await flush();
    assert.deepEqual(seen.modes, ['live', 'connecting', 'live']);
    feed.stop();
  });

  test('a stream that ends at once is not hammered: it is retried after the delay, which grows', async () => {
    const { feed, seen, last } = rig();
    feed.start();

    for (let expectedWait = 1000, round = 1; round <= 3; round++, expectedWait *= 2) {
      last().handlers.onOpen();
      last().handlers.onComplete(); // refused or cut within moments
      mock.timers.tick(expectedWait - 1);
      assert.equal(seen.streams.length, round, `no new stream before ${expectedWait} ms`);
      mock.timers.tick(1);
      assert.equal(seen.streams.length, round + 1);
    }
    feed.stop();
  });

  test('a stream that sends nothing for 45 seconds is dead; heartbeats keep it alive', async () => {
    const { feed, seen, last } = rig();
    feed.start();
    last().handlers.onOpen();
    await flush();

    for (let i = 0; i < 6; i++) {
      mock.timers.tick(20_000);
      last().handlers.onActivity(); // a heartbeat every 20 seconds
    }
    assert.equal(seen.streams[0]!.closed, false);
    assert.equal(feed.currentMode, 'live');

    mock.timers.tick(46_000); // silence
    assert.equal(seen.streams[0]!.closed, true);
    assert.equal(feed.currentMode, 'polling');
    feed.stop();
  });

  test('an error that retrying cannot fix stops everything and is reported once', async () => {
    const { feed, seen, last } = rig();
    feed.start();
    last().handlers.onOpen();
    await flush();
    const lists = seen.lists;

    last().handlers.onError(new Fatal('login over'));
    mock.timers.tick(10 * 60_000);
    await flush();

    assert.equal(seen.fatal.length, 1);
    assert.equal(seen.streams.length, 1); // no reconnect
    assert.equal(seen.lists, lists); // no more polling
    assert.equal(seen.streams[0]!.closed, true);
  });

  test('changes that arrive while the list is being fetched are held and applied after it, in order', async () => {
    const { feed, seen, last, releaseList } = rig({ listDelay: true });
    feed.start(); // the list is in flight
    last().handlers.onOpen();
    last().handlers.onChange({ id: 'a', sequence: 2 });
    last().handlers.onChange({ id: 'b', sequence: 1 });
    assert.deepEqual(seen.applied, []);

    releaseList();
    await flush();
    assert.deepEqual(seen.applied, [
      { id: 'a', sequence: 2 },
      { id: 'b', sequence: 1 },
    ]);

    releaseList(); // the second list (after the stream opened)
    await flush();
    last().handlers.onChange({ id: 'c', sequence: 1 });
    assert.equal(seen.applied.length, 3); // applied at once when no list is in flight
    feed.stop();
  });

  test('a stream that has been replaced or closed is ignored', async () => {
    const { feed, seen, last } = rig();
    feed.start();
    const old = last();
    old.handlers.onOpen();
    await flush();

    old.handlers.onError(new Error('cut'));
    mock.timers.tick(1000);
    const next = last();
    assert.notEqual(next, old);

    old.handlers.onChange({ id: 'ghost', sequence: 9 });
    old.handlers.onError(new Error('late'));
    old.handlers.onOpen();
    assert.deepEqual(seen.applied, []);
    assert.equal(seen.streams.length, 2); // the late error did not start another retry
    feed.stop();
  });

  test('stop closes the stream and ends the polling and the retries', async () => {
    const { feed, seen, last } = rig();
    feed.start();
    last().handlers.onOpen();
    await flush();
    const lists = seen.lists;

    feed.stop();
    mock.timers.tick(10 * 60_000);
    await flush();

    assert.equal(seen.streams[0]!.closed, true);
    assert.equal(seen.lists, lists);
    assert.equal(seen.streams.length, 1);
  });
});

describe('applyChange', () => {
  const o = (id: string, status: string, sequence?: number): QueueOrder => ({
    id,
    reference: id,
    status,
    updatedAt: 'x',
    sequence,
  });

  test('adds an order the screen did not hold, and replaces one it did by a higher sequence', () => {
    const held = [o('a', 'PLACED', 1)];

    assert.deepEqual(
      applyChange(held, o('b', 'PLACED', 1)).map((x) => x.id),
      ['b', 'a'],
    );
    assert.equal(applyChange(held, o('a', 'CONFIRMED', 2))[0]!.status, 'CONFIRMED');
  });

  test('ignores a change that is not newer, and returns the same list so nothing is drawn again', () => {
    const held = [o('a', 'CONFIRMED', 3)];

    assert.equal(applyChange(held, o('a', 'PLACED', 2)), held);
    assert.equal(applyChange(held, o('a', 'PLACED', 3)), held);
  });

  test('removes an order that is no longer shown, and ignores one that never was', () => {
    const held = [o('a', 'READY_FOR_FULFILLMENT', 3), o('b', 'PLACED', 1)];

    assert.deepEqual(
      applyChange(held, o('a', 'COMPLETED', 4)).map((x) => x.id),
      ['b'],
    );
    assert.equal(applyChange(held, o('z', 'CANCELLED', 1)), held);
  });

  test('without a sequence on either side the change is taken (the list and the stream carry one, so this is only a guard)', () => {
    assert.equal(applyChange([o('a', 'PLACED')], o('a', 'CONFIRMED'))[0]!.status, 'CONFIRMED');
  });
});
