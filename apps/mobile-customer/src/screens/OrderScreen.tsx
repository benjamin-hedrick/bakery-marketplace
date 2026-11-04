import { HEADLINES, referenceOf, when } from '@bakery/customer-core';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { gql } from '../api';
import { LINE_NAME, ORDER, type LineNameData, type OrderData } from '../queries';
import { Button, Loading, Notice, money, styles } from '../ui';

type Order = NonNullable<OrderData['order']>;
type Names = ReadonlyMap<string, { name: string; modifiers: ReadonlyMap<string, string> }>;

const POLL_MS = 5000;

export function OrderScreen(props: { id: string; onBrowse: () => void }) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [names, setNames] = useState<Names>(new Map());
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await gql<OrderData>(ORDER, { id: props.id }, { authenticated: true });
      setOrder(data.order);
      setFailed(false);
      if (data.order) {
        const ids = [...new Set(data.order.lineItems.map((l) => l.listingId))];
        const found = await Promise.all(
          ids.map((id) => gql<LineNameData>(LINE_NAME, { id }).then((d) => [id, d.listing] as const)),
        );
        setNames(
          new Map(
            found.flatMap(([id, l]) =>
              l ? [[id, { name: l.name, modifiers: new Map(l.modifiers.map((m) => [m.id, m.name])) }] as const] : [],
            ),
          ),
        );
      }
    } catch {
      setFailed(true);
    }
  }, [props.id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS); // the status moves on without the screen knowing
    return () => clearInterval(timer);
  }, [load]);

  if (order === undefined && !failed) return <Loading />;
  if (order === undefined || failed) {
    return (
      <View style={styles.pad}>
        <Notice text="The order could not be loaded." testID="order-error">
          <Button label="Try again" testID="order-retry" onPress={load} />
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
      <Button label="Browse the menu" testID="order-browse" kind="plain" onPress={props.onBrowse} />
    </ScrollView>
  );
}
