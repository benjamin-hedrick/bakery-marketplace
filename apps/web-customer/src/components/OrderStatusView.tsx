import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { OrderLineListingQuery } from '../__generated__/OrderLineListingQuery.graphql';
import type { OrderStatusCancelMutation } from '../__generated__/OrderStatusCancelMutation.graphql';
import type { OrderStatusQuery, OrderStatusQuery$data } from '../__generated__/OrderStatusQuery.graphql';
import { formatMoney } from '@bakery/customer-core';
import {
  CANCEL_OUTCOME_TEXT,
  CANCEL_QUESTION,
  customerMayCancel,
  HEADLINES,
  referenceOf,
  time,
  when,
  type CancelOutcome,
} from '@bakery/customer-core';

// A customer cancels their own order (while it is placed or confirmed). The answer does not edit the page: the order is read again from the network, so
// what is shown is what ordering says, whatever the answer was. A refusal is an expected answer, not an error.
const cancelMutation = graphql`
  mutation OrderStatusCancelMutation($input: CancelOrderInput!) {
    cancelOrder(input: $input) {
      __typename
      ... on CancelOrderDone {
        orderId
        status
      }
      ... on CancelOrderRejected {
        code
        currentStatus
      }
    }
  }
`;

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
  const [asking, setAsking] = useState(false); // "Cancel this order?" is on screen
  const [cancelNote, setCancelNote] = useState<CancelOutcome | null>(null);
  const [commitCancel, cancelling] = useMutation<OrderStatusCancelMutation>(cancelMutation);

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

  function cancelOrder() {
    setAsking(false);
    setCancelNote(null);
    commitCancel({
      variables: { input: { orderId: id } },
      onCompleted: (data) => {
        const result = data.cancelOrder;
        setCancelNote(
          result.__typename === 'CancelOrderDone'
            ? 'cancelled'
            : result.__typename === 'CancelOrderRejected' && result.code === 'NOT_FOUND'
              ? 'missing'
              : 'not_allowed_now',
        );
        reload(); // what is shown is what ordering now says, whatever the answer was
      },
      onError: () => setCancelNote('failed'), // nothing is known to have changed: the page stays as it is
    });
  }

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
      {customerMayCancel(order.status) ? (
        asking ? (
          <p role="group" aria-label="Cancel this order?" data-testid="cancel-question">
            {CANCEL_QUESTION}{' '}
            <button type="button" data-testid="cancel-confirm" onClick={cancelOrder}>
              Yes, cancel the order
            </button>{' '}
            <button type="button" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </p>
        ) : (
          <button type="button" data-testid="cancel-order" disabled={cancelling} onClick={() => setAsking(true)}>
            Cancel order
          </button>
        )
      ) : null}
      {cancelNote ? (
        <p role={cancelNote === 'cancelled' ? 'status' : 'alert'} data-testid="cancel-note" data-outcome={cancelNote}>
          {CANCEL_OUTCOME_TEXT[cancelNote]}
        </p>
      ) : null}
    </article>
  );
}
