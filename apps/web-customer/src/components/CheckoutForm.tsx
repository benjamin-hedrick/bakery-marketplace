import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { CheckoutPaymentMethodsQuery } from '../__generated__/CheckoutPaymentMethodsQuery.graphql';
import type { CheckoutPlaceOrderMutation } from '../__generated__/CheckoutPlaceOrderMutation.graphql';
import type { CheckoutWindowsQuery } from '../__generated__/CheckoutWindowsQuery.graphql';
import {
  estimatedTotalCents,
  fingerprint,
  lineTotalCents,
  MAX_QUANTITY,
  NO_PAYMENT_METHODS_TEXT,
  removeLine,
  selectedPaymentMethodId,
  setQuantity,
  toPlaceOrderInput,
  type Cart,
  type PaymentMethod,
} from '@bakery/customer-core';
import { cartStore, useCart } from '../lib/cart/useCart.ts';
import {
  allergensToTell,
  allergyConflictKey,
  lineAllergenSentences,
  lineConflictText,
  needsAcknowledgement,
} from '@bakery/customer-core';
import { dietCartText } from '@bakery/customer-core';
import { randomUrlSafe } from '@bakery/customer-core';
import { formatMoney } from '@bakery/customer-core';
import { GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';
import { useCheckoutAllergens } from './useCheckoutAllergens';

const windowsQuery = graphql`
  query CheckoutWindowsQuery($vendorId: ID!) {
    pickupWindows(vendorId: $vendorId) {
      start
      end
    }
  }
`;

// The customer's saved payment methods (WI-ORD-010): an id and a description each. The order sent carries only the id of the chosen one.
const paymentMethodsQuery = graphql`
  query CheckoutPaymentMethodsQuery {
    paymentMethods {
      id
      description
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
type Methods = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; methods: readonly PaymentMethod[] };

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
  const [methods, setMethods] = useState<Methods>({ state: 'loading' });
  const [pickedMethod, setPickedMethod] = useState<string | null>(null); // what the customer chose; the first method is shown chosen until then
  const methodId = methods.state === 'ready' ? selectedPaymentMethodId(methods.methods, pickedMethod) : null;
  const [problem, setProblem] = useState<Problem | null>(null);
  const [placed, setPlaced] = useState(false);
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);
  const vendorId = cart.vendorId;

  // Allergens (WI-CUST-008): what each line contains (for everyone), the customer's own conflicts (with a profile), the acknowledgement a serious conflict
  // asks for, and which of the customer's allergies to tell the bakery. All advice and hints: the services decide what an order may contain.
  const info = useCheckoutAllergens(cart);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [ackFor, setAckFor] = useState<string | null>(null);
  const profile = info.profile.state === 'ready' ? info.profile.value : null;
  const lineConflicts = info.check.state === 'ready' ? info.check.value.conflicts : [];
  const lineDiets = info.check.state === 'ready' ? info.check.value.diets : [];
  const ackKey = allergyConflictKey(lineConflicts);
  const mustAcknowledge = needsAcknowledgement(lineConflicts);
  const acknowledged = ackFor === ackKey;
  const checking = info.profile.state === 'loading' || info.check.state === 'loading';
  const checkFailed = info.profile.state === 'failed' || info.check.state === 'failed';
  const tell = profile ? allergensToTell(profile.allergies, unticked) : [];

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

  // Always from the network too: methods belong to the signed-in customer and must never come from a stored answer.
  const fetchMethods = useCallback(() => {
    fetchQuery<CheckoutPaymentMethodsQuery>(environment, paymentMethodsQuery, {}, { fetchPolicy: 'network-only' })
      .toPromise()
      .then((data) => setMethods({ state: 'ready', methods: data?.paymentMethods ?? [] }))
      .catch(() => setMethods({ state: 'failed' }));
  }, [environment]);
  const reloadMethods = () => {
    setMethods({ state: 'loading' });
    fetchMethods();
  };
  useEffect(fetchMethods, [fetchMethods]);

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
    if (mustAcknowledge && !acknowledged) return; // the button is off in this case; this is the same rule for any other way in
    if (methodId === null) return; // the button is off without a payment method
    const content = fingerprint(cart, pickupWindow, methodId, tell);
    if (attempt.current?.fingerprint !== content) {
      // "checkout-" first, so the key always starts with a letter or digit as ordering-service requires
      attempt.current = { key: `checkout-${randomUrlSafe(16)}`, fingerprint: content };
    }
    setProblem(null);
    commit({
      variables: {
        input: { idempotencyKey: attempt.current.key, ...toPlaceOrderInput(cart, pickupWindow, methodId, tell) },
      },
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
                {info.listings.state === 'ready' ? (
                  <div>
                    <small data-testid="line-allergens">
                      {lineAllergenSentences(info.listings.value.get(line.listingId), line.modifiers, info.labels).join(
                        '. ',
                      )}
                    </small>
                  </div>
                ) : info.listings.state === 'failed' ? (
                  <div>
                    <small data-testid="line-allergens-failed">
                      Allergen information could not be loaded. Check with the bakery.
                    </small>
                  </div>
                ) : null}
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

      <p>
        <label>
          Payment method{' '}
          <select
            value={methodId ?? ''}
            disabled={methods.state !== 'ready' || methods.methods.length === 0}
            onChange={(e) => {
              setPickedMethod(e.target.value);
              setProblem(null);
            }}
          >
            {methods.state === 'ready'
              ? methods.methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.description}
                  </option>
                ))
              : null}
          </select>
        </label>{' '}
        {methods.state === 'loading' ? <small>Loading payment methods…</small> : null}
        {methods.state === 'failed' ? (
          <small role="alert" data-testid="payment-methods-failed">
            Payment methods could not be loaded.{' '}
            <button type="button" onClick={reloadMethods}>
              Try again
            </button>
          </small>
        ) : null}
        {methods.state === 'ready' && methods.methods.length === 0 ? (
          <small role="alert" data-testid="no-payment-methods">
            {NO_PAYMENT_METHODS_TEXT}
          </small>
        ) : null}
      </p>

      {profile || checkFailed ? (
        <section aria-label="Your allergies" data-testid="allergy-section">
          {checkFailed ? (
            <p role="alert" data-testid="check-failed">
              We could not check this order against your allergies. You can still place it; please check the allergens
              listed above with the bakery.
            </p>
          ) : null}
          {profile && info.check.state === 'ready' ? (
            <>
              {lineConflicts.length > 0 ? (
                <ul data-testid="conflicts" className="conflicts">
                  {lineConflicts.map(({ lineIndex, conflict }) => {
                    const line = cart.lines[lineIndex];
                    if (!line) return null;
                    const m = lineConflictText(
                      line.name,
                      conflict,
                      info.labels,
                      new Map(line.modifiers.map((o) => [o.id, o.name])),
                    );
                    return (
                      <li
                        key={`${lineIndex}:${conflict.allergenId}:${conflict.source}`}
                        data-testid="conflict"
                        data-severity={m.severity}
                      >
                        <span aria-hidden="true">{m.severity === 'ALLERGY' ? '⚠ ' : 'ℹ '}</span>
                        <strong>{m.heading}:</strong> {m.line}.
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {/* The diets the customer prefers (WI-TAG-004): the bakery's claim, a quiet note, never a reason to block. */}
              {lineDiets.some((d) => !d.marked) ? (
                <ul data-testid="diet-notes" className="diet-notes">
                  {lineDiets.map((d) => {
                    const line = cart.lines[d.lineIndex];
                    if (!line) return null;
                    const names = new Map(line.modifiers.map((o) => [o.id, o.name]));
                    const text = dietCartText(line.name, {
                      tagId: d.tagId,
                      label: info.labels.get(d.tagId) ?? d.tagId,
                      marked: d.marked,
                      itemMarked: d.itemMarked,
                      optionNames: d.optionIdsNotMarked.map((id) => names.get(id) ?? 'An option'),
                    });
                    return text ? (
                      <li key={`${d.lineIndex}:${d.tagId}`} className="diet-note" data-testid="diet-note">
                        {text}.
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : null}
              <p data-testid="personal-reminder">
                Marked from what the bakery has listed. An item without a mark is not guaranteed free of your allergens,
                so check with the bakery when it matters.
              </p>
              {mustAcknowledge ? (
                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAckFor(e.target.checked ? ackKey : null)}
                    />{' '}
                    I have read this and still want to order
                  </label>
                </p>
              ) : null}
            </>
          ) : null}
          {profile && profile.allergies.length > 0 ? (
            <fieldset data-testid="tell-bakery">
              <legend>Tell the bakery</legend>
              <p>The bakery will see these allergies with your order.</p>
              {profile.allergies.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={!unticked.has(id)}
                    onChange={(e) => {
                      const next = new Set(unticked);
                      if (e.target.checked) next.delete(id);
                      else next.add(id);
                      setUnticked(next);
                      setProblem(null);
                    }}
                  />{' '}
                  {info.labels.get(id) ?? id}{' '}
                </label>
              ))}
            </fieldset>
          ) : null}
        </section>
      ) : null}

      {problem ? <ProblemNotice problem={problem} cart={cart} onOrderChanged={() => setProblem(null)} /> : null}

      <p>
        <button
          type="submit"
          disabled={inFlight || checking || methodId === null || (mustAcknowledge && !acknowledged)}
        >
          {inFlight ? 'Placing your order…' : 'Place test order'}
        </button>{' '}
        {checking ? <small data-testid="checking">Checking this order against your allergies…</small> : null}
        {mustAcknowledge && !acknowledged ? (
          <small data-testid="ack-needed">Tick the box above to place this order.</small>
        ) : null}{' '}
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
