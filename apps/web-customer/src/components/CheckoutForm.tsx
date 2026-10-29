import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { CheckoutPlaceOrderMutation } from '../__generated__/CheckoutPlaceOrderMutation.graphql';
import type { CheckoutWindowsQuery } from '../__generated__/CheckoutWindowsQuery.graphql';
import {
  estimatedTotalCents,
  fingerprint,
  lineTotalCents,
  MAX_QUANTITY,
  removeLine,
  setQuantity,
  toPlaceOrderInput,
  type Cart,
} from '../lib/cart/cart.ts';
import { cartStore, useCart } from '../lib/cart/useCart.ts';
import { randomUrlSafe } from '../lib/auth/pkce.ts';
import { formatMoney } from '../lib/money';
import { GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';

const windowsQuery = graphql`
  query CheckoutWindowsQuery($vendorId: ID!) {
    pickupWindows(vendorId: $vendorId) {
      start
      end
    }
  }
`;

const placeOrderMutation = graphql`
  mutation CheckoutPlaceOrderMutation($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      __typename
      ... on PlaceOrderSuccess {
        order {
          id
          status
        }
      }
      ... on PlaceOrderRejected {
        code
        message
        fields {
          field
          message
        }
        shortfalls {
          listingId
          available
        }
      }
    }
  }
`;

type Window = { readonly start: string; readonly end: string };
type Windows = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; windows: readonly Window[] };

interface Rejection {
  kind: 'rejected';
  code: string;
  message: string;
  fields: readonly { field: string; message: string }[];
  shortfalls: readonly { listingId: string; available: number }[];
}
type Problem = Rejection | { kind: 'error'; reference: string | undefined };

const money = (cents: number) => formatMoney({ cents, currency: 'USD' });
const dayOf = (w: Window) =>
  new Date(w.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The checkout (first-slice contract section 6). It sends what to ask for and shows what the server says: the server prices the order,
 * checks the limits and the window, and decides. The idempotency key belongs to one content of the order and one outcome: it is reused when
 * the same order is submitted again after an unexpected error or a timeout (an order may exist, and the retry returns it), and replaced as
 * soon as anything about the order changes or the attempt was rejected (nothing was placed, and the rejected attempt's key is spent).
 */
export function CheckoutForm() {
  const cart = useCart();
  const environment = useRelayEnvironment();
  const router = useRouter();
  const [commit, inFlight] = useMutation<CheckoutPlaceOrderMutation>(placeOrderMutation);
  const [windows, setWindows] = useState<Windows>({ state: 'loading' });
  const [selected, setSelected] = useState(''); // the start of the chosen window, or '' for no specific time
  const [problem, setProblem] = useState<Problem | null>(null);
  const [placed, setPlaced] = useState(false);
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);
  const vendorId = cart.vendorId;

  // Always from the network: the open slots change every few minutes, so a stored answer could offer one checkout would refuse.
  const fetchWindows = useCallback(() => {
    if (vendorId === null) return;
    fetchQuery<CheckoutWindowsQuery>(environment, windowsQuery, { vendorId }, { fetchPolicy: 'network-only' })
      .toPromise()
      .then((data) => setWindows({ state: 'ready', windows: data?.pickupWindows ?? [] }))
      .catch(() => setWindows({ state: 'failed' }));
  }, [environment, vendorId]);
  const reloadWindows = () => {
    setWindows({ state: 'loading' });
    fetchWindows();
  };

  useEffect(fetchWindows, [fetchWindows]);

  if (placed) return <p role="status">Placing your order…</p>;
  if (cart.lines.length === 0) {
    return (
      <section data-testid="empty-order">
        <p>Your order is empty.</p>
        <Link href="/">Browse the bakeries</Link>
      </section>
    );
  }

  const chosen = windows.state === 'ready' ? (windows.windows.find((w) => w.start === selected) ?? null) : null;

  function submit() {
    const pickupWindow = chosen ? { start: chosen.start, end: chosen.end } : null;
    const content = fingerprint(cart, pickupWindow);
    if (attempt.current?.fingerprint !== content) {
      // "checkout-" first, so the key always starts with a letter or digit as ordering-service requires
      attempt.current = { key: `checkout-${randomUrlSafe(16)}`, fingerprint: content };
    }
    setProblem(null);
    commit({
      variables: { input: { idempotencyKey: attempt.current.key, ...toPlaceOrderInput(cart, pickupWindow) } },
      onCompleted: ({ placeOrder }) => {
        if (placeOrder.__typename === 'PlaceOrderSuccess') {
          setPlaced(true);
          cartStore.clear();
          void router.push(`/orders/${encodeURIComponent(placeOrder.order.id)}`);
        } else if (placeOrder.__typename === 'PlaceOrderRejected') {
          // A rejection is final: nothing was placed, and the attempt's reservation (if it got that far) has been given back. Ordering will
          // not re-reserve for the same order id, which is derived from the key, so a retry needs a new key. (An unexpected error is different:
          // an order may exist, so onError keeps the key and the retry returns it.)
          attempt.current = null;
          setProblem({ kind: 'rejected', ...placeOrder });
          if (placeOrder.code === 'PICKUP_WINDOW_UNAVAILABLE') {
            setSelected('');
            reloadWindows(); // what was offered has moved on: show what is open now
          }
        }
      },
      onError: (error) => {
        // An ended login is handled by the login gate (the session is already cleared); the order stays in the cart.
        if (error instanceof UnauthenticatedError) return;
        setProblem({ kind: 'error', reference: error instanceof GraphQLRequestError ? error.reference : undefined });
      },
    });
  }

  return (
    <form
      aria-label="Place your order"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Quantity</th>
            <th scope="col">Estimate</th>
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cart.lines.map((line, i) => (
            <tr key={`${line.listingId}|${line.modifiers.map((m) => m.id).join(',')}`} data-testid="order-line">
              <td>
                {line.name}
                {line.modifiers.length ? <small> — {line.modifiers.map((m) => m.name).join(', ')}</small> : null}
              </td>
              <td>
                <select
                  aria-label={`Quantity of ${line.name}`}
                  value={line.quantity}
                  onChange={(e) => {
                    cartStore.update((c) => setQuantity(c, i, Number(e.target.value)));
                    setProblem(null);
                  }}
                >
                  {Array.from(
                    { length: Math.min(MAX_QUANTITY, line.maxPerOrder ?? MAX_QUANTITY) },
                    (_, n) => n + 1,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              <td>{money(lineTotalCents(line))}</td>
              <td>
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => {
                    cartStore.update((c) => removeLine(c, i));
                    setProblem(null);
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p data-testid="estimate">
        Estimated total <strong>{money(estimatedTotalCents(cart))}</strong>{' '}
        <small>The final price is worked out by the bakery&apos;s own prices when you place the order.</small>
      </p>

      <p>
        <label>
          Pickup time{' '}
          <select
            value={selected}
            disabled={windows.state !== 'ready'}
            onChange={(e) => {
              setSelected(e.target.value);
              setProblem(null);
            }}
          >
            <option value="">No specific time</option>
            {windows.state === 'ready'
              ? Array.from(Map.groupBy(windows.windows, dayOf)).map(([day, slots]) => (
                  <optgroup key={day} label={day}>
                    {slots.map((w) => (
                      <option key={w.start} value={w.start}>
                        {timeOf(w.start)} – {timeOf(w.end)}
                      </option>
                    ))}
                  </optgroup>
                ))
              : null}
          </select>
        </label>{' '}
        {windows.state === 'loading' ? <small>Loading pickup times…</small> : null}
        {windows.state === 'failed' ? (
          <small role="alert" data-testid="windows-failed">
            Pickup times could not be loaded.{' '}
            <button type="button" onClick={reloadWindows}>
              Try again
            </button>
          </small>
        ) : null}
      </p>
      <p>
        <small>A specific pickup time or a customized item waits for the bakery to confirm.</small>
      </p>

      {problem ? <ProblemNotice problem={problem} cart={cart} onOrderChanged={() => setProblem(null)} /> : null}

      <p>
        <button type="submit" disabled={inFlight}>
          {inFlight ? 'Placing your order…' : 'Place test order'}
        </button>{' '}
        <small>Test checkout: no payment is taken.</small>
      </p>
    </form>
  );
}

/** What went wrong, what it means for this order, and (where there is one) the thing the customer can do about it. */
function ProblemNotice({
  problem,
  cart,
  onOrderChanged,
}: {
  problem: Problem;
  cart: Cart;
  /** The customer changed the order in response to the notice, which was about the old order, so it should go. */
  onOrderChanged: () => void;
}) {
  if (problem.kind === 'error') {
    return (
      <section role="alert" data-testid="checkout-error">
        <p>We could not place your order. Nothing has been charged. Please try again in a moment.</p>
        {problem.reference ? <small>If it keeps happening, quote reference {problem.reference}.</small> : null}
      </section>
    );
  }

  return (
    <section role="alert" data-testid="checkout-rejection" data-code={problem.code}>
      <p>{problem.message}</p>
      {problem.code === 'INSUFFICIENT_STOCK'
        ? problem.shortfalls.map((s) => {
            const at = cart.lines.findIndex((l) => l.listingId === s.listingId);
            const line = cart.lines[at];
            if (!line) return null;
            return (
              <p key={s.listingId} data-testid="shortfall">
                {line.name}: {s.available === 0 ? 'none left' : `only ${s.available} available`}.{' '}
                {s.available > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      cartStore.update((c) => setQuantity(c, at, s.available));
                      onOrderChanged();
                    }}
                  >
                    Change to {s.available}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      cartStore.update((c) => removeLine(c, at));
                      onOrderChanged();
                    }}
                  >
                    Remove it
                  </button>
                )}
              </p>
            );
          })
        : null}
      {problem.code === 'LISTING_UNAVAILABLE' ? <Link href="/">Back to the bakeries</Link> : null}
      {problem.fields.length > 0 ? (
        <ul>
          {problem.fields.map((f) => (
            <li key={`${f.field}:${f.message}`}>{f.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
