import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { OrderHistoryQuery, OrderHistoryQuery$data } from '../__generated__/OrderHistoryQuery.graphql';
import { formatMoney } from '@bakery/customer-core';
import { HEADLINES, referenceOf, when } from '@bakery/customer-core';

const PAGE_SIZE = 10;

const historyQuery = graphql`
  query OrderHistoryQuery($first: Int!, $after: String) {
    orders(first: $first, after: $after) {
      edges {
        node {
          id
          status
          createdAt
          total {
            cents
            currency
          }
          lineItems {
            quantity
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type Order = OrderHistoryQuery$data['orders']['edges'][number]['node'];
type State =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; orders: readonly Order[]; next: string | null; loadingMore: boolean; moreFailed: boolean };

/**
 * The customer's orders, newest first (WI-CUST-007). Always read from the network, because statuses move on and the answer is private to the
 * customer (the BFF sends no-store); nothing is kept for the next person. Each order links to its page, where the detail is.
 */
export function OrderHistory() {
  const environment = useRelayEnvironment();
  const [view, setView] = useState<State>({ state: 'loading' });

  const fetchPage = useCallback(
    (after: string | null) =>
      fetchQuery<OrderHistoryQuery>(
        environment,
        historyQuery,
        { first: PAGE_SIZE, after },
        { fetchPolicy: 'network-only' },
      ).toPromise(),
    [environment],
  );

  const loadFirst = useCallback(() => {
    fetchPage(null)
      .then((data) => {
        if (!data) return setView({ state: 'failed' });
        const { edges, pageInfo } = data.orders;
        setView({
          state: 'ready',
          orders: edges.map((e) => e.node),
          next: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
          loadingMore: false,
          moreFailed: false,
        });
      })
      .catch(() => setView({ state: 'failed' }));
  }, [fetchPage]);

  useEffect(loadFirst, [loadFirst]);

  const loadMore = () => {
    if (view.state !== 'ready' || !view.next || view.loadingMore) return;
    const { orders, next } = view;
    setView({ ...view, loadingMore: true, moreFailed: false });
    fetchPage(next)
      .then((data) => {
        if (!data) throw new Error('empty');
        const { edges, pageInfo } = data.orders;
        setView({
          state: 'ready',
          orders: [...orders, ...edges.map((e) => e.node)],
          next: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
          loadingMore: false,
          moreFailed: false,
        });
      })
      .catch(() => setView({ state: 'ready', orders, next, loadingMore: false, moreFailed: true }));
  };

  if (view.state === 'loading') return <p>Loading your orders…</p>;
  if (view.state === 'failed') {
    return (
      <section role="alert" data-testid="history-failed">
        <p>We could not load your orders. Nothing has changed.</p>
        <button
          type="button"
          onClick={() => {
            setView({ state: 'loading' });
            loadFirst();
          }}
        >
          Try again
        </button>
      </section>
    );
  }
  if (view.orders.length === 0) {
    return (
      <section data-testid="history-empty">
        <p>You have not placed any orders yet.</p>
        <Link href="/">Browse the bakeries</Link>
      </section>
    );
  }

  return (
    <section aria-label="Your orders">
      <ul className="order-history">
        {view.orders.map((order) => {
          const items = order.lineItems.reduce((n, l) => n + l.quantity, 0);
          const status = HEADLINES[order.status]?.headline ?? 'Order status';
          return (
            <li key={order.id} data-testid="history-order">
              <Link href={`/orders/${encodeURIComponent(order.id)}`}>
                Order <strong>{referenceOf(order.id)}</strong>
              </Link>{' '}
              ·{' '}
              <span data-testid="history-status" data-status={order.status}>
                {status}
              </span>{' '}
              · {when(order.createdAt)} · {items} {items === 1 ? 'item' : 'items'} ·{' '}
              <span data-testid="history-total">{formatMoney(order.total)}</span>
            </li>
          );
        })}
      </ul>
      {view.moreFailed ? (
        <p role="alert" data-testid="history-more-failed">
          We could not load more orders.
        </p>
      ) : null}
      {view.next ? (
        <button type="button" onClick={loadMore} disabled={view.loadingMore}>
          {view.loadingMore ? 'Loading…' : 'Show older orders'}
        </button>
      ) : null}
    </section>
  );
}
