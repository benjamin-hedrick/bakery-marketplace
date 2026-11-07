import { ADD_REFUSAL_TEXT, addLine, decideAdd } from '@bakery/customer-core';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { gql } from '../api';
import { cartStore } from '../cart';
import { LISTING, type ListingDetailData } from '../queries';
import { readFreshStock } from '../stock';
import { Button, Loading, Notice, colors, money, styles } from '../ui';

const MESSAGES: Record<string, string> = {
  other_vendor: 'Your order has items from another bakery. Place or clear that order first.',
  too_many_lines: 'Your order has the most different items it can hold.',
  invalid_quantity: 'Choose a quantity of at least 1.',
};

export function DetailScreen(props: { id: string; onAdded: () => void }) {
  const [data, setData] = useState<ListingDetailData['listing'] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    gql<ListingDetailData>(LISTING, { id: props.id })
      .then((d) => setData(d.listing))
      .catch(() => setFailed(true));
  }, [props.id]);

  if (failed) return <Notice text="This item could not be loaded." testID="detail-error" />;
  if (data === undefined) return <Loading />;
  if (data === null) return <Notice text="This item is no longer available." testID="detail-missing" tone="info" />;

  const soldOut = data.stock.status === 'SOLD_OUT';
  const picked = data.modifiers.filter((m) => chosen.has(m.id));
  const unit = data.price.cents + picked.reduce((s, m) => s + m.priceDelta.cents, 0);

  // Read the stock again, then decide from that read (customer-core `decideAdd`; WI-CUST-009). A read that failed adds nothing and says so. Advice
  // only: checkout's atomic reservation is still the authority.
  async function add() {
    if (!data || checking) return;
    setChecking(true);
    setMessage(null);
    const read = await readFreshStock(props.id);
    setChecking(false);
    const decision = decideAdd(read);
    if (!decision.allowed) {
      setMessage(ADD_REFUSAL_TEXT[decision.refusal]);
      if (read.kind === 'listing') setData({ ...data, stock: { ...data.stock, ...read.stock } as typeof data.stock }); // the screen follows the read
      return;
    }
    const result = addLine(cartStore.get(), data.vendorId, {
      listingId: data.id,
      name: data.name,
      unitPriceCents: data.price.cents,
      currency: data.price.currency,
      modifiers: picked.map((m) => ({ id: m.id, name: m.name, priceDeltaCents: m.priceDelta.cents })),
      quantity,
      maxPerOrder: decision.maxPerOrder,
    });
    if ('error' in result) return setMessage(MESSAGES[result.error] ?? 'This could not be added.');
    cartStore.update(() => result.cart);
    props.onAdded();
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} testID="detail">
      <Text style={styles.title} testID="detail-name">
        {data.name}
      </Text>
      {data.description ? <Text style={styles.text}>{data.description}</Text> : null}
      <Text style={styles.text}>{money(data.price)}</Text>
      <Text style={styles.muted}>{soldOut ? 'Sold out' : data.stock.status === 'LOW' ? 'Low stock' : 'In stock'}</Text>

      {data.modifiers.length > 0 ? <Text style={styles.title}>Options</Text> : null}
      {data.modifiers.map((m) => {
        const on = chosen.has(m.id);
        return (
          <Button
            key={m.id}
            testID={`option-${m.name}`}
            kind={on ? 'primary' : 'plain'}
            label={`${on ? '✓ ' : ''}${m.name}${m.priceDelta.cents ? ` (+${money(m.priceDelta)})` : ''}`}
            onPress={() =>
              setChosen((c) => (c.has(m.id) ? new Set([...c].filter((x) => x !== m.id)) : new Set([...c, m.id])))
            }
          />
        );
      })}

      <View style={styles.row}>
        <Button label="−" testID="quantity-less" kind="plain" onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
        <Text style={styles.title} testID="quantity">
          {quantity}
        </Text>
        <Button label="+" testID="quantity-more" kind="plain" onPress={() => setQuantity((q) => q + 1)} />
      </View>
      <Text style={{ color: colors.muted }}>{money({ cents: unit * quantity, currency: data.price.currency })}</Text>
      {message ? <Notice text={message} testID="detail-message" /> : null}
      <Button
        label={soldOut ? 'Sold out' : checking ? 'Checking stock…' : 'Add to order'}
        testID="add-to-order"
        onPress={() => void add()}
        disabled={soldOut || checking}
      />
    </ScrollView>
  );
}
