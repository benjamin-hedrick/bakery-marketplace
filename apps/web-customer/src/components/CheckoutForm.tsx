import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import { graphql, useMutation } from 'react-relay';
import type { CheckoutPaymentMethodsQuery } from '../__generated__/CheckoutPaymentMethodsQuery.graphql';
import type { CheckoutPlaceOrderMutation } from '../__generated__/CheckoutPlaceOrderMutation.graphql';
import type { CheckoutWindowsQuery } from '../__generated__/CheckoutWindowsQuery.graphql';
import {
  allergensToTell,
  allergyConflictKey,
  fingerprint,
  needsAcknowledgement,
  randomUrlSafe,
  selectedPaymentMethodId,
  toPlaceOrderInput,
  type Part,
  type PaymentMethod,
} from '@bakery/customer-core';
import { cartStore, useCart } from '../lib/cart/useCart.ts';
import { GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';
import { useNetworkQuery } from '../lib/relay/useNetworkQuery';
import { CheckoutAllergies } from './CheckoutAllergies';
import { PaymentMethodField, PickupTimeField, type PickupWindow } from './CheckoutFields';
import { CheckoutLines } from './CheckoutLines';
import { ProblemNotice, type Problem } from './CheckoutProblem';
import { useCheckoutAllergens } from './useCheckoutAllergens';

// Always from the network (useNetworkQuery): the open slots change every few minutes, so a stored answer could offer one checkout would refuse.
const windowsQuery = graphql`
  query CheckoutWindowsQuery($vendorId: ID!) {
    pickupWindows(vendorId: $vendorId) {
      start
      end
    }
  }
`;

// The customer's saved payment methods (WI-ORD-010): an id and a description each. The order sent carries only the id of the chosen one.
// Always from the network too: methods belong to the signed-in customer and must never come from a stored answer.
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

/** A part's value mapped, its loading or failed state kept. */
function mapPart<A, B>(part: Part<A>, map: (value: A) => B): Part<B> {
  return part.state === 'ready' ? { state: 'ready', value: map(part.value) } : part;
}

/**
 * The checkout (first-slice contract section 6). It sends what to ask for and shows what the server says: the server prices the order,
 * checks the limits and the window, and decides. The idempotency key belongs to one content of the order and one outcome: it is reused when
 * the same order is submitted again after an unexpected error or a timeout (an order may exist, and the retry returns it), and replaced as
 * soon as anything about the order changes or the attempt was rejected (nothing was placed, and the rejected attempt's key is spent).
 * The page's parts are in CheckoutLines, CheckoutFields, CheckoutAllergies and CheckoutProblem; this component holds the state and the submit.
 */
export function CheckoutForm() {
  const cart = useCart();
  const router = useRouter();
  const [commit, inFlight] = useMutation<CheckoutPlaceOrderMutation>(placeOrderMutation);
  const vendorId = cart.vendorId;

  const [windowsAnswer, reloadWindows] = useNetworkQuery<CheckoutWindowsQuery>(
    windowsQuery,
    vendorId === null ? null : { vendorId },
  );
  const windows: Part<readonly PickupWindow[]> = mapPart(windowsAnswer, (d) => d.pickupWindows);
  const [selected, setSelected] = useState(''); // the start of the chosen window, or '' for no specific time

  const [methodsAnswer, reloadMethods] = useNetworkQuery<CheckoutPaymentMethodsQuery>(paymentMethodsQuery, {});
  const methods: Part<readonly PaymentMethod[]> = mapPart(methodsAnswer, (d) => d.paymentMethods);
  const [pickedMethod, setPickedMethod] = useState<string | null>(null); // what the customer chose; the first method is shown chosen until then
  const methodId = methods.state === 'ready' ? selectedPaymentMethodId(methods.value, pickedMethod) : null;

  const [problem, setProblem] = useState<Problem | null>(null);
  const [placed, setPlaced] = useState(false);
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);

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

  if (placed) return <p role="status">Placing your order…</p>;
  if (cart.lines.length === 0) {
    return (
      <section data-testid="empty-order">
        <p>Your order is empty.</p>
        <Link href="/">Browse the bakeries</Link>
      </section>
    );
  }

  const chosen = windows.state === 'ready' ? (windows.value.find((w) => w.start === selected) ?? null) : null;
  const clearProblem = () => setProblem(null);

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
      <CheckoutLines cart={cart} info={info} onOrderChanged={clearProblem} />

      <PickupTimeField
        windows={windows}
        selected={selected}
        onSelect={(start) => {
          setSelected(start);
          clearProblem();
        }}
        onRetry={reloadWindows}
      />
      <p>
        <small>A specific pickup time or a customized item waits for the bakery to confirm.</small>
      </p>

      <PaymentMethodField
        methods={methods}
        methodId={methodId}
        onPick={(id) => {
          setPickedMethod(id);
          clearProblem();
        }}
        onRetry={reloadMethods}
      />

      <CheckoutAllergies
        cart={cart}
        info={info}
        profile={profile}
        checkFailed={checkFailed}
        lineConflicts={lineConflicts}
        lineDiets={lineDiets}
        mustAcknowledge={mustAcknowledge}
        acknowledged={acknowledged}
        onAcknowledge={(yes) => setAckFor(yes ? ackKey : null)}
        unticked={unticked}
        onTell={(id, yes) => {
          const next = new Set(unticked);
          if (yes) next.delete(id);
          else next.add(id);
          setUnticked(next);
          clearProblem();
        }}
      />

      {problem ? <ProblemNotice problem={problem} cart={cart} onOrderChanged={clearProblem} /> : null}

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
