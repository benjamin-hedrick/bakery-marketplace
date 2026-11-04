import { estimatedTotalCents, fingerprint, time, toPlaceOrderInput } from '@bakery/customer-core';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { ApiError, gql } from '../api';
import { randomUrlSafe } from '../auth/pkce';
import { cartStore, useCart } from '../cart';
import { PICKUP_WINDOWS, PLACE_ORDER, type PickupWindowsData, type PlaceOrderData } from '../queries';
import { Button, Loading, Notice, money, styles } from '../ui';

// Set at build time for the test build the Maestro flows use; absent in any other build, which then has no switch.
const TEST_HOOKS = process.env.EXPO_PUBLIC_TEST_HOOKS === '1';

type Window = { start: string; end: string };
type Problem = { text: string; code?: string } | null;

export function CheckoutScreen(props: { onPlaced: (orderId: string) => void; onBack: () => void }) {
  const cart = useCart();
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [windowsFailed, setWindowsFailed] = useState(false);
  const [pickup, setPickup] = useState<Window | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [declineTest, setDeclineTest] = useState(false); // only when the build was made with EXPO_PUBLIC_TEST_HOOKS=1: asks the BFF's test hook to decline the payment (never in a release)
  // One key per content of the order and per outcome (first-slice contract D-6): reused for a retry of the same content after a failure to
  // hear the answer, replaced when the content changes or after the server has answered with a rejection.
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);

  const vendorId = cart.vendorId;
  useEffect(() => {
    if (!vendorId) return;
    gql<PickupWindowsData>(PICKUP_WINDOWS, { vendorId })
      .then((d) => setWindows(d.pickupWindows))
      .catch(() => setWindowsFailed(true));
  }, [vendorId]);

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
    setBusy(true);
    setProblem(null);
    const content = fingerprint(cart, pickup);
    if (attempt.current?.fingerprint !== content)
      attempt.current = { key: `mobile-${randomUrlSafe(16)}`, fingerprint: content };
    try {
      const data = await gql<PlaceOrderData>(
        PLACE_ORDER,
        { input: { idempotencyKey: attempt.current.key, ...toPlaceOrderInput(cart, pickup) } },
        { authenticated: true, headers: TEST_HOOKS && declineTest ? { 'x-test-payment': 'decline' } : {} },
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

      {TEST_HOOKS ? (
        <View style={styles.row}>
          <Text style={styles.muted}>Test: decline the payment</Text>
          <Switch testID="decline-test" value={declineTest} onValueChange={setDeclineTest} />
        </View>
      ) : null}

      {problem ? <Notice text={problem.text} testID="checkout-rejection" /> : null}
      <Button label={busy ? 'Placing…' : 'Place order'} testID="place-order" onPress={place} disabled={busy} />
      <Button label="Back to my order" testID="checkout-back" kind="plain" onPress={props.onBack} />
    </ScrollView>
  );
}
