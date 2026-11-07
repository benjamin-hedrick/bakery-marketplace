import {
  CANCEL_OUTCOME_TEXT,
  CANCEL_QUESTION,
  customerMayCancel,
  HEADLINES,
  OrderPoller,
  referenceOf,
  when,
  type CancelOutcome,
} from '@bakery/customer-core';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { gql } from '../api';
import { cancelOrder } from '../cancel';
import { LINE_NAME, ORDER, type LineNameData, type OrderData } from '../queries';
import { Button, Loading, Notice, money, styles } from '../ui';

type Order = NonNullable<OrderData['order']>;
type Names = ReadonlyMap<string, { name: string; modifiers: ReadonlyMap<string, string> }>;

async function readNames(order: Order): Promise<Names> {
  const ids = [...new Set(order.lineItems.map((l) => l.listingId))];
  const found = await Promise.all(
    ids.map(
      (id) =>
        gql<LineNameData>(LINE_NAME, { id })
          .then((d) => [id, d.listing] as const)
          .catch(() => [id, null] as const), // a name that cannot be read is shown as a plain "Item"; the order itself is what matters
    ),
  );
  return new Map(
    found.flatMap(([id, l]) =>
      l ? [[id, { name: l.name, modifiers: new Map(l.modifiers.map((m) => [m.id, m.name])) }] as const] : [],
    ),
  );
}

export function OrderScreen(props: { id: string; onBrowse: () => void }) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [names, setNames] = useState<Names>(new Map());
  const [failed, setFailed] = useState(false); // the first read failed: there is nothing to show yet
  const [stale, setStale] = useState(false); // a later read failed: the screen shows the last status it had
  const [asking, setAsking] = useState(false); // "Cancel this order?" is on screen
  const [cancelling, setCancelling] = useState(false);
  const [cancelNote, setCancelNote] = useState<CancelOutcome | null>(null);
  const poller = useRef<OrderPoller<Order | null> | null>(null);

  // The status is kept current by polling while the order can still change (customer-core `OrderPoller`: every few seconds, one read at a time, only while
  // the app is in front, stopped once the order is completed or cancelled, slower after a failure). The names of the items do not change: read once.
  useEffect(() => {
    let namesRead = false;
    const p = new OrderPoller<Order | null>({
      read: async () => {
        const data = await gql<OrderData>(ORDER, { id: props.id }, { authenticated: true });
        if (data.order && !namesRead) {
          namesRead = true;
          setNames(await readNames(data.order));
        }
        return data.order;
      },
      statusOf: (o) => o?.status ?? null,
      onValue: (o) => {
        setOrder(o);
        setFailed(false);
        setStale(false);
      },
      onFailure: () => {
        setFailed(true);
        setStale(true);
      },
      isVisible: () => AppState.currentState === 'active',
    });
    poller.current = p;
    p.start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') p.refreshNow(); // back in front: do not wait for the next tick
    });
    return () => {
      sub.remove();
      p.stop();
      poller.current = null;
    };
  }, [props.id]);

  async function confirmCancel() {
    setAsking(false);
    setCancelling(true);
    setCancelNote(null);
    const outcome = await cancelOrder(props.id);
    setCancelling(false);
    setCancelNote(outcome);
    if (outcome !== 'failed') poller.current?.refreshNow(); // what is shown is what ordering now says, whatever the answer was
  }

  if (order === undefined && !failed) return <Loading />;
  if (order === undefined) {
    return (
      <View style={styles.pad}>
        <Notice text="The order could not be loaded." testID="order-error">
          <Button label="Try again" testID="order-retry" onPress={() => poller.current?.refreshNow()} />
        </Notice>
      </View>
    );
  }
  if (order === null) return <Notice text="This order could not be found." testID="order-missing" tone="info" />;

  const status = HEADLINES[order.status] ?? { headline: order.status, detail: '' };
  return (
    <ScrollView contentContainerStyle={styles.pad} testID="order">
      <Text style={styles.title} testID="order-headline" accessibilityLiveRegion="polite">
        {status.headline}
      </Text>
      <Text style={styles.text}>{status.detail}</Text>
      <Text
        style={styles.muted}
        testID="order-status"
        accessibilityHint={order.status}
      >{`Status: ${order.status}`}</Text>
      {stale ? (
        <Notice
          text="We could not refresh just now. This is the last status we have, and we will keep trying."
          testID="order-stale"
          tone="info"
        />
      ) : null}
      <Text style={styles.muted}>{`Order ${referenceOf(order.id)}`}</Text>
      {order.pickupWindow ? <Text style={styles.text}>{`Pickup ${when(order.pickupWindow.start)}`}</Text> : null}
      {order.lineItems.map((l, i) => {
        const known = names.get(l.listingId);
        const options = l.modifierIds.map((id) => known?.modifiers.get(id)).filter(Boolean);
        return (
          <View key={i} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.text}>{`${l.quantity} × ${known?.name ?? 'Item'}`}</Text>
              <Text style={styles.text}>{money(l.price)}</Text>
            </View>
            {options.length > 0 ? <Text style={styles.muted}>{options.join(', ')}</Text> : null}
          </View>
        );
      })}
      <Text style={styles.title} testID="order-total">{`Total ${money(order.total)}`}</Text>
      {customerMayCancel(order.status) ? (
        asking ? (
          <Notice text={CANCEL_QUESTION} testID="cancel-question" tone="info">
            <Button label="Yes, cancel the order" testID="cancel-confirm" onPress={() => void confirmCancel()} />
            <Button label="Keep it" testID="cancel-keep" kind="plain" onPress={() => setAsking(false)} />
          </Notice>
        ) : (
          <Button
            label="Cancel order"
            testID="cancel-order"
            kind="plain"
            disabled={cancelling}
            onPress={() => setAsking(true)}
          />
        )
      ) : null}
      {cancelNote ? (
        <Notice
          text={CANCEL_OUTCOME_TEXT[cancelNote]}
          testID="cancel-note"
          tone={cancelNote === 'cancelled' ? 'info' : 'error'}
        />
      ) : null}
      <Button label="Browse the menu" testID="order-browse" kind="plain" onPress={props.onBrowse} />
    </ScrollView>
  );
}
