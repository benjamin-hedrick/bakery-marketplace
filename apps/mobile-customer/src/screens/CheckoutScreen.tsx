import {
  allergensToTell,
  allergyConflictKey,
  estimatedTotalCents,
  fingerprint,
  lineConflictText,
  needsAcknowledgement,
  NO_PAYMENT_METHODS_TEXT,
  selectedPaymentMethodId,
  time,
  toPlaceOrderInput,
  type PaymentMethod,
} from '@bakery/customer-core';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ApiError, gql } from '../api';
import { useCheckoutAllergens } from '../allergens';
import { randomUrlSafe } from '../auth/pkce';
import { cartStore, useCart } from '../cart';
import {
  PAYMENT_METHODS,
  PICKUP_WINDOWS,
  PLACE_ORDER,
  type PaymentMethodsData,
  type PickupWindowsData,
  type PlaceOrderData,
} from '../queries';
import { Button, Checkbox, Loading, Notice, colors, money, styles } from '../ui';

type Window = { start: string; end: string };
type Problem = { text: string; code?: string } | null;

/** Two rows of a button (about 45 high) and the gap between them: the most a seeded customer has. */
const PAYMENT_AREA_HEIGHT = 100;

export function CheckoutScreen(props: { onPlaced: (orderId: string) => void; onBack: () => void }) {
  const cart = useCart();
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [windowsFailed, setWindowsFailed] = useState(false);
  const [pickup, setPickup] = useState<Window | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  // The saved payment methods (WI-ORD-010): the first is chosen until the customer picks another. The order carries only the chosen id.
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [methodsFailed, setMethodsFailed] = useState(false);
  const [pickedMethod, setPickedMethod] = useState<string | null>(null);
  const methodId = methods ? selectedPaymentMethodId(methods, pickedMethod) : null;
  // One key per content of the order and per outcome (first-slice contract D-6): reused for a retry of the same content after a failure to
  // hear the answer, replaced when the content changes or after the server has answered with a rejection.
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);

  // Allergens (WI-MOB-002), as on the web (WI-CUST-008): what each line contains is on the cart; here the customer's own conflicts (with a saved profile), the
  // acknowledgement a serious conflict asks for, and which of the customer's allergies to tell the bakery. All advice: the services decide what an order may contain.
  const info = useCheckoutAllergens(cart, { withProfile: true });
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [ackFor, setAckFor] = useState<string | null>(null);
  const profile = info.profile.state === 'ready' ? info.profile.value : null;
  const lineConflicts = info.check.state === 'ready' ? info.check.value : [];
  const ackKey = allergyConflictKey(lineConflicts); // a tick given for one set of conflicts is not carried to another
  const mustAcknowledge = needsAcknowledgement(lineConflicts);
  const acknowledged = ackFor === ackKey;
  const checking = info.profile.state === 'loading' || info.check.state === 'loading';
  const checkFailed = info.profile.state === 'failed' || info.check.state === 'failed';
  const noProfile = info.profile.state === 'ready' && info.profile.value === null;
  const tell = profile ? allergensToTell(profile.allergies, unticked) : [];

  const vendorId = cart.vendorId;
  useEffect(() => {
    if (!vendorId) return;
    gql<PickupWindowsData>(PICKUP_WINDOWS, { vendorId })
      .then((d) => setWindows(d.pickupWindows))
      .catch(() => setWindowsFailed(true));
  }, [vendorId]);

  const loadMethods = () => {
    setMethodsFailed(false);
    gql<PaymentMethodsData>(PAYMENT_METHODS, {}, { authenticated: true })
      .then((d) => setMethods(d.paymentMethods))
      .catch(() => setMethodsFailed(true));
  };
  useEffect(loadMethods, []);

  if (cart.lines.length === 0) {
    return (
      <View style={styles.pad}>
        <Notice text="Your order is empty." testID="checkout-empty" tone="info">
          <Button label="Back" testID="checkout-back" onPress={props.onBack} />
        </Notice>
      </View>
    );
  }
  if (!windows && !windowsFailed) return <Loading />;

  async function place() {
    if (mustAcknowledge && !acknowledged) return; // the button is off in this case; this is the same rule for any other way in
    if (methodId === null) return; // the button is off without a payment method
    setBusy(true);
    setProblem(null);
    const content = fingerprint(cart, pickup, methodId, tell);
    if (attempt.current?.fingerprint !== content)
      attempt.current = { key: `mobile-${randomUrlSafe(16)}`, fingerprint: content };
    try {
      const data = await gql<PlaceOrderData>(
        PLACE_ORDER,
        { input: { idempotencyKey: attempt.current.key, ...toPlaceOrderInput(cart, pickup, methodId, tell) } },
        { authenticated: true },
      );
      const result = data.placeOrder;
      if (result.__typename === 'PlaceOrderSuccess') {
        cartStore.clear();
        props.onPlaced(result.order.id);
        return;
      }
      attempt.current = null; // the rejected attempt is spent: a retry is a new attempt
      setProblem({ text: result.message, code: result.code }); // the cart is kept
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'UNAUTHENTICATED'))
        setProblem({ text: 'The order could not be placed. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} testID="checkout">
      <Text style={styles.title}>Checkout</Text>
      <Text
        style={styles.text}
        testID="checkout-total"
      >{`Estimated total ${money({ cents: estimatedTotalCents(cart), currency: cart.lines[0]!.currency })}`}</Text>

      {/* Allergies: first, because it is the part a customer must not miss. */}
      {checking ? (
        <Text style={styles.muted} testID="checking">
          Checking this order against your allergies…
        </Text>
      ) : null}
      {checkFailed ? (
        <Notice
          text="We could not check this order against your allergies. You can still place it; please check the allergens listed in your order with the bakery."
          testID="check-failed"
        />
      ) : null}
      {noProfile ? (
        <Notice
          tone="info"
          testID="no-profile"
          text="You have no allergy profile saved, so this order was not checked against your allergies. The allergens listed in your order are only what the bakery has flagged; check with the bakery when it matters."
        />
      ) : null}
      {profile && info.check.state === 'ready' ? (
        <View style={{ gap: 8 }} testID="allergy-section">
          {lineConflicts.map(({ lineIndex, conflict }, n) => {
            const line = cart.lines[lineIndex];
            if (!line) return null;
            const mark = lineConflictText(
              line.name,
              conflict,
              info.labels,
              new Map(line.modifiers.map((o) => [o.id, o.name])),
            );
            return (
              <View
                key={`${lineIndex}:${conflict.allergenId}:${conflict.source}`}
                style={styles.notice}
                testID={`conflict-${n}`}
              >
                <Text style={{ color: mark.severity === 'ALLERGY' ? colors.error : colors.ink, fontSize: 15 }}>
                  {`${mark.severity === 'ALLERGY' ? '⚠ ' : 'ℹ '}${mark.heading}: ${mark.line}.`}
                </Text>
              </View>
            );
          })}
          <Text style={styles.muted} testID="personal-reminder">
            Marked from what the bakery has listed. An item without a mark is not guaranteed free of your allergens, so
            check with the bakery when it matters.
          </Text>
          {mustAcknowledge ? (
            <Checkbox
              testID="acknowledge"
              label="I have read this and still want to order"
              checked={acknowledged}
              onChange={(on) => setAckFor(on ? ackKey : null)}
            />
          ) : null}
          {mustAcknowledge && !acknowledged ? (
            // Next to the box, not next to the button: the button is further down the screen than a customer will look.
            <Text style={styles.muted} testID="ack-needed">
              Tick this box to place your order.
            </Text>
          ) : null}
        </View>
      ) : null}
      {profile && profile.allergies.length > 0 ? (
        <View style={styles.card} testID="tell-bakery">
          <Text style={styles.title}>Tell the bakery</Text>
          <Text style={styles.muted}>The bakery will see these allergies with your order.</Text>
          {profile.allergies.map((id) => (
            <Checkbox
              key={id}
              testID={`tell-${id}`}
              label={info.labels.get(id) ?? id}
              checked={!unticked.has(id)}
              onChange={(on) => {
                const next = new Set(unticked);
                if (on) next.delete(id);
                else next.add(id);
                setUnticked(next);
                setProblem(null);
              }}
            />
          ))}
        </View>
      ) : null}

      <Text style={styles.title}>Pickup time</Text>
      {windowsFailed ? (
        <Notice text="Pickup times could not be loaded. You can still order without one." testID="windows-error" />
      ) : null}
      {windows && windows.length === 0 ? (
        <Text style={styles.muted}>No specific pickup times are on offer right now.</Text>
      ) : null}
      {windows && windows.length > 0 ? (
        // many quarter-hour windows: a fixed-height list keeps Place order near the top of the screen
        <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }} testID="windows">
          {windows.map((w, i) => (
            <Button
              key={w.start}
              testID={`window-${i}`}
              kind={pickup?.start === w.start ? 'primary' : 'plain'}
              label={`${pickup?.start === w.start ? '✓ ' : ''}${time(w.start)} – ${time(w.end)}`}
              onPress={() => setPickup(pickup?.start === w.start ? null : w)}
            />
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.title}>Payment method</Text>
      {methodsFailed ? (
        <Notice text="Payment methods could not be loaded." testID="payment-methods-failed">
          <Button label="Try again" testID="payment-methods-retry" onPress={loadMethods} />
        </Notice>
      ) : null}
      {methods && methods.length === 0 ? (
        <Notice tone="info" text={NO_PAYMENT_METHODS_TEXT} testID="no-payment-methods" />
      ) : null}
      {/* The loading line and the list share a fixed-height area (two rows, the most a seeded customer has; more scroll), so the list
          arriving never moves Place order and a tap cannot land on a method by accident (register 161). The notices above need no such
          area: with no method chosen, Place order is off and a tap on it does nothing. */}
      {(!methods && !methodsFailed) || (methods && methods.length > 0) ? (
        <ScrollView
          nestedScrollEnabled
          style={{ height: PAYMENT_AREA_HEIGHT }}
          contentContainerStyle={{ gap: 8 }}
          testID="payment-area"
        >
          {!methods ? <Text style={styles.muted}>Loading payment methods…</Text> : null}
          {methods && methods.length > 0 ? (
            <View style={{ gap: 8 }} testID="payment-methods">
              {methods.map((m, i) => (
                <Button
                  key={m.id}
                  testID={`payment-${i}`}
                  kind={methodId === m.id ? 'primary' : 'plain'}
                  label={`${methodId === m.id ? '✓ ' : ''}${m.description}`}
                  onPress={() => {
                    setPickedMethod(m.id);
                    setProblem(null);
                  }}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {problem ? <Notice text={problem.text} testID="checkout-rejection" /> : null}
      <Button
        label={busy ? 'Placing…' : 'Place order'}
        testID="place-order"
        onPress={place}
        disabled={busy || checking || methodId === null || (mustAcknowledge && !acknowledged)}
      />
      <Button label="Back to my order" testID="checkout-back" kind="plain" onPress={props.onBack} />
    </ScrollView>
  );
}
