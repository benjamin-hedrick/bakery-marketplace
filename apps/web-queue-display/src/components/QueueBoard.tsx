import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { QueueBoardQuery, QueueBoardQuery$data } from '../__generated__/QueueBoardQuery.graphql';
import { GraphQLRequestError, getBrowserEnvironment, UnauthenticatedError } from '../lib/relay/environment';
import { groupOrders, newOrderIds, type QueueOrder } from '../lib/queue';

// The vendor's orders that are still in progress, newest change first. Display only: nothing on this screen changes an order.
const queueQuery = graphql`
  query QueueBoardQuery {
    vendorOrders(status: ACTIVE, first: 50) {
      edges {
        node {
          id
          reference
          status
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

/** How often the screen asks again. Polling is the v1 design (WI-QUE-002); real-time push is a v2 candidate, not built. */
export const POLL_MS = 7000;

/** How long an order stays marked as new after it first appears on the screen. */
export const NEW_FOR_MS = 60_000;

type Orders = NonNullable<QueueBoardQuery$data['vendorOrders']>['edges'][number]['node'][];
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
  const seen = useRef<Set<string> | null>(null); // null until the first answer: what is on the screen at the start is not "new"

  const refresh = useCallback(async () => {
    try {
      const data = await fetchQuery<QueueBoardQuery>(
        getBrowserEnvironment(),
        queueQuery,
        {},
        { fetchPolicy: 'network-only' },
      ).toPromise();
      const next = (data?.vendorOrders.edges ?? []).map((e) => e.node);
      const now = Date.now();
      const arrived =
        seen.current === null
          ? []
          : newOrderIds(
              seen.current,
              next.map((o) => o.id),
            );
      seen.current = new Set(next.map((o) => o.id));
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
    } catch (e) {
      // The last good list stays on the screen: a kitchen should not lose its queue because one poll failed.
      if (e instanceof UnauthenticatedError) setLoad({ state: 'ended' });
      else if (e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN')) setLoad({ state: 'forbidden' });
      else setLoad({ state: 'failed' });
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0); // from a callback, not the effect body: the first answer sets state when it arrives
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

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
          <span>Updated {updatedAt ? clock.format(updatedAt) : ''}</span>
        )}
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
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
