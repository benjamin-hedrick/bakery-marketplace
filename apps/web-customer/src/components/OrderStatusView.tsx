import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { OrderLineListingQuery } from '../__generated__/OrderLineListingQuery.graphql';
import type { OrderStatusQuery, OrderStatusQuery$data } from '../__generated__/OrderStatusQuery.graphql';
import { formatMoney } from '../lib/money';
import { HEADLINES, referenceOf, time, when } from '../lib/orderText';

const orderQuery = graphql`
  query OrderStatusQuery($id: ID!) {
    order(id: $id) {
      id
      status
      vendorId
      createdAt
      total {
        cents
        currency
      }
      pickupWindow {
        start
        end
      }
      lineItems {
        listingId
        modifierIds
        quantity
        price {
          cents
          currency
        }
      }
    }
  }
`;

// An order line carries ids and the price charged, not names, so the names are read from the listings (public data).
const listingNamesQuery = graphql`
  query OrderLineListingQuery($id: ID!) {
    listing(id: $id) {
      name
      modifiers {
        id
        name
      }
    }
  }
`;

type Order = NonNullable<OrderStatusQuery$data['order']>;
type Names = ReadonlyMap<string, { name: string; modifiers: ReadonlyMap<string, string> }>;
type State =
  { state: 'loading' } | { state: 'failed' } | { state: 'missing' } | { state: 'ready'; order: Order; names: Names };

const money = (m: { cents: number; currency: string }) => formatMoney(m);

/**
 * The order as ordering-service has it (first-slice contract section 6): the status, what was ordered, what it cost, and when to collect it.
 * Always read from the network, because the status moves on without this page knowing; the answer is private to the customer (the BFF
 * sends no-store) and an order that is not theirs reads the same as one that does not exist.
 */
export function OrderStatusView({ id }: { id: string }) {
  const environment = useRelayEnvironment();
  const [view, setView] = useState<State>({ state: 'loading' });

  const load = useCallback(() => {
    const options = { fetchPolicy: 'network-only' } as const;
    fetchQuery<OrderStatusQuery>(environment, orderQuery, { id }, options)
      .toPromise()
      .then(async (data) => {
        const order = data?.order;
        if (!order) return setView({ state: 'missing' });
        const names = new Map<string, { name: string; modifiers: ReadonlyMap<string, string> }>();
        await Promise.all(
          [...new Set(order.lineItems.map((l) => l.listingId))].map(
            (listingId) =>
              fetchQuery<OrderLineListingQuery>(environment, listingNamesQuery, { id: listingId }, options)
                .toPromise()
                .then((r) => {
                  if (r?.listing)
                    names.set(listingId, {
                      name: r.listing.name,
                      modifiers: new Map(r.listing.modifiers.map((m) => [m.id, m.name])),
                    });
                })
                .catch(() => undefined), // a name that cannot be read is shown as a plain "Item"; the order itself is what matters
          ),
        );
        setView({ state: 'ready', order, names });
      })
      .catch(() => setView({ state: 'failed' }));
  }, [environment, id]);

  useEffect(load, [load]);

  const reload = () => {
    setView({ state: 'loading' });
    load();
  };

  if (view.state === 'loading') return <p>Loading your order…</p>;
  if (view.state === 'failed') {
    return (
      <section role="alert" data-testid="order-failed">
        <p>We could not load your order. It has not changed.</p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </section>
    );
  }
  if (view.state === 'missing') {
    return (
      <section data-testid="order-missing">
        <p>We could not find that order.</p>
        <Link href="/">Browse the bakeries</Link>
      </section>
    );
  }

  const { order, names } = view;
  const status = HEADLINES[order.status] ?? { headline: 'Order status', detail: '' };
  return (
    <article aria-label="Your order">
      <h2 data-testid="order-status" data-status={order.status}>
        {status.headline}
      </h2>
      <p>{status.detail}</p>
      <p>
        Reference <strong data-testid="order-reference">{referenceOf(order.id)}</strong> · placed{' '}
        {when(order.createdAt)}
      </p>
      <ul>
        {order.lineItems.map((line, i) => {
          const known = names.get(line.listingId);
          const options = line.modifierIds.map((m) => known?.modifiers.get(m) ?? m);
          return (
            <li key={`${line.listingId}:${i}`} data-testid="order-item">
              {line.quantity} × {known?.name ?? 'Item'}
              {options.length ? <small> — {options.join(', ')}</small> : null} <span>{money(line.price)}</span>
            </li>
          );
        })}
      </ul>
      <p>
        Total <strong data-testid="order-total">{money(order.total)}</strong>
      </p>
      <p data-testid="order-pickup">
        {order.pickupWindow
          ? `Pickup ${new Date(order.pickupWindow.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time(order.pickupWindow.start)} – ${time(order.pickupWindow.end)}`
          : 'No specific pickup time'}
      </p>
      <p>
        <small>Test order: no payment was taken.</small>
      </p>
      <button type="button" onClick={reload}>
        Refresh status
      </button>
    </article>
  );
}
