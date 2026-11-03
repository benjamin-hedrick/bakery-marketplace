import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { QueueBoardQuery, QueueBoardQuery$data } from '../__generated__/QueueBoardQuery.graphql';
import { GraphQLRequestError, getBrowserEnvironment, UnauthenticatedError } from '../lib/relay/environment';
import { LiveFeed, type Mode } from '../lib/live-feed';
import { openVendorOrderStream, type OrderChange } from '../lib/live-stream';
import { OrderActions } from './OrderActions';
import { applyChange, groupOrders, mergeFetched, newOrderIds, type QueueOrder } from '../lib/queue';

// The vendor's orders that are still in progress, newest change first. The vendor acts on an order with the buttons on its card (WI-QUE-004);
// the board itself only shows what the service says. The list is the baseline (WI-QUE-002); live changes arrive on a stream and are applied on top by their sequence numbers (WI-QUE-003, ADR-0021).
const queueQuery = graphql`
  query QueueBoardQuery {
    vendorOrders(status: ACTIVE, first: 50) {
      edges {
        node {
          id
          reference
          status
          sequence
          itemCount
          automatic
          placedAt
          updatedAt
          pickupWindow {
            start
            end
          }
          pickupInstructions
          lines {
            listingId
            listingName
            quantity
            modifiers {
              id
              name
            }
          }
        }
      }
    }
  }
`;

/** How long an order stays marked as new after it first appears on the screen. */
export const NEW_FOR_MS = 60_000;

type Orders = NonNullable<QueueBoardQuery$data['vendorOrders']>['edges'][number]['node'][];
// A pushed order must be usable in the list: if the two documents drift apart, this stops compiling.
const _sameShape = (change: OrderChange): Orders[number] => change;
void _sameShape;
type Load =
  { state: 'loading' } | { state: 'ready' } | { state: 'ended' } | { state: 'forbidden' } | { state: 'failed' };

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

function windowText(w: QueueOrder['pickupWindow']): string | null {
  return w ? `${time.format(new Date(w.start))} to ${time.format(new Date(w.end))}` : null;
}

export function QueueBoard() {
  const [orders, setOrders] = useState<Orders>([]);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [fresh, setFresh] = useState<ReadonlyMap<string, number>>(new Map());
  const [announcement, setAnnouncement] = useState('');
  const [mode, setMode] = useState<Mode>('connecting');
  const [delayMs, setDelayMs] = useState<number | null>(null);
  const seen = useRef<Set<string> | null>(null); // null until the first answer: what is on the screen at the start is not "new"
  const held = useRef<Orders>([]); // what the screen shows now, for applying a pushed change on top of it
  const feed = useRef<LiveFeed<OrderChange> | null>(null);
  const pushedAt = useRef<Map<string, number>>(new Map()); // when a push last said something about an order (the merge of a fetched list needs it)

  /** Puts a list of orders on the screen and marks the ones that were not there before (from the list or from the stream alike). */
  const show = useCallback((next: Orders, now: number) => {
    const arrived =
      seen.current === null
        ? []
        : newOrderIds(
            seen.current,
            next.map((o) => o.id),
          );
    seen.current = new Set(next.map((o) => o.id));
    held.current = next;
    setOrders(next);
    if (arrived.length > 0) {
      setFresh((current) => new Map([...current, ...arrived.map((id) => [id, now] as const)]));
      setAnnouncement(
        `New: ${next
          .filter((o) => arrived.includes(o.id))
          .map((o) => o.reference)
          .join(', ')}`,
      );
    }
    setUpdatedAt(new Date(now));
    setLoad({ state: 'ready' });
  }, []);

  const refresh = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const data = await fetchQuery<QueueBoardQuery>(
        getBrowserEnvironment(),
        queueQuery,
        {},
        { fetchPolicy: 'network-only' },
      ).toPromise();
      // The list may have been read before a change that was pushed while it was on its way: merge, do not replace (register item 133).
      show(
        mergeFetched(
          held.current,
          (data?.vendorOrders.edges ?? []).map((e) => e.node),
          (id) => (pushedAt.current.get(id) ?? 0) >= startedAt,
        ),
        Date.now(),
      );
    } catch (e) {
      // The last good list stays on the screen: a kitchen should not lose its queue because one poll failed.
      if (e instanceof UnauthenticatedError) {
        feed.current?.stop();
        setLoad({ state: 'ended' });
      } else if (e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN')) {
        feed.current?.stop();
        setLoad({ state: 'forbidden' });
      } else setLoad({ state: 'failed' });
    }
  }, [show]);

  /** A change from the stream: applied only if it is newer than what the screen holds. */
  const change = useCallback(
    (incoming: OrderChange) => {
      pushedAt.current.set(incoming.id, Date.now());
      const next = applyChange(held.current, incoming);
      if (next === held.current) return;
      const now = Date.now();
      setDelayMs(Math.max(0, now - Date.parse(incoming.updatedAt)));
      show(next, now);
    },
    [show],
  );

  useEffect(() => {
    const live = new LiveFeed<OrderChange>({
      openStream: openVendorOrderStream,
      refreshList: refresh,
      applyChange: change,
      onMode: setMode,
      isFatal: (e) =>
        e instanceof UnauthenticatedError || (e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN')),
      onFatal: (e) => setLoad(e instanceof UnauthenticatedError ? { state: 'ended' } : { state: 'forbidden' }),
    });
    feed.current = live;
    live.start();
    return () => {
      live.stop();
      feed.current = null;
    };
  }, [refresh, change]);

  // The "new" mark fades by itself: forget the ones older than NEW_FOR_MS.
  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - NEW_FOR_MS;
      setFresh((current) => new Map([...current].filter(([, at]) => at > cutoff)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [fresh]);

  if (load.state === 'ended') {
    return (
      <section role="alert" data-testid="queue-login-ended">
        <p>Your login has ended. Please log in again to see the queue.</p>
      </section>
    );
  }
  if (load.state === 'forbidden') {
    return (
      <section role="alert" data-testid="queue-forbidden">
        <p>This login is not a vendor&apos;s, so there is no queue to show.</p>
      </section>
    );
  }

  const columns = groupOrders(orders);
  // For a demo: add ?delay=1 to the address to see how long the last pushed change took to arrive. The clocks of the server and of this screen
  // must agree for the number to mean anything, so it is off unless asked for.
  const showDelay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('delay');

  return (
    <main className="queue" aria-label="Order queue">
      <div className="queue-status" data-testid="queue-status">
        {load.state === 'loading' ? (
          <span>Loading the queue…</span>
        ) : load.state === 'failed' ? (
          <span role="alert" data-testid="queue-stale">
            Cannot refresh. Showing the queue as of {updatedAt ? clock.format(updatedAt) : 'never'}.
          </span>
        ) : (
          <span>
            Updated {updatedAt ? clock.format(updatedAt) : ''}
            {' · '}
            <span className="queue-mode" data-testid="queue-mode" data-mode={mode === 'live' ? 'live' : 'polling'}>
              {mode === 'live' ? 'Live' : 'Polling'}
            </span>
          </span>
        )}
        {showDelay && delayMs !== null ? (
          <span className="queue-delay" data-testid="queue-delay">
            {' · '}Last change reached this screen {delayMs} ms after it happened
          </span>
        ) : null}
      </div>
      <div className="visually-hidden" role="status" aria-live="polite" data-testid="queue-announcement">
        {announcement}
      </div>
      {load.state === 'ready' && orders.length === 0 ? <p data-testid="queue-empty">No orders in progress.</p> : null}
      <div className="queue-columns">
        {columns.map((column) => (
          <section key={column.key} aria-labelledby={`col-${column.key}`} data-testid={`column-${column.key}`}>
            <h2 id={`col-${column.key}`}>
              {column.title} <span className="count">({column.orders.length})</span>
            </h2>
            <ul>
              {column.orders.map((o) => (
                <li
                  key={o.id}
                  className={fresh.has(o.id) ? 'order new' : 'order'}
                  data-testid="queue-order"
                  data-reference={o.reference}
                >
                  <div className="order-head">
                    <strong data-testid="reference">{o.reference}</strong>
                    {fresh.has(o.id) ? (
                      <span className="badge" data-testid="new-badge">
                        New
                      </span>
                    ) : null}
                    {windowText(o.pickupWindow) ? (
                      <span data-testid="window">Pickup {windowText(o.pickupWindow)}</span>
                    ) : null}
                  </div>
                  <ul className="lines">
                    {o.lines.map((l, i) => (
                      <li key={`${l.listingId}-${i}`}>
                        {l.quantity} × {l.listingName ?? l.listingId}
                        {l.modifiers.length > 0 ? (
                          <span className="options"> ({l.modifiers.map((m) => m.name ?? m.id).join(', ')})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {o.pickupInstructions ? <p className="instructions">{o.pickupInstructions}</p> : null}
                  <OrderActions
                    orderId={o.id}
                    reference={o.reference}
                    status={o.status}
                    onSettled={() => void refresh()}
                    onAnnounce={setAnnouncement}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
