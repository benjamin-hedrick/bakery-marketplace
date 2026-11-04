import { estimatedTotalCents, lineTotalCents, removeLine, setQuantity } from '@bakery/customer-core';
import { ScrollView, Text, View } from 'react-native';
import { cartStore, useCart } from '../cart';
import { Button, Notice, money, styles } from '../ui';

export function CartScreen(props: { onCheckout: () => void; onBrowse: () => void }) {
  const cart = useCart();
  if (cart.lines.length === 0) {
    return (
      <View style={styles.pad}>
        <Notice text="Your order is empty." testID="cart-empty" tone="info">
          <Button label="Browse the menu" testID="cart-browse" onPress={props.onBrowse} />
        </Notice>
      </View>
    );
  }
  const currency = cart.lines[0]!.currency;
  return (
    <ScrollView contentContainerStyle={styles.pad} testID="cart">
      {cart.lines.map((line, i) => (
        <View key={`${line.listingId}-${i}`} style={styles.card} testID={`cart-line-${line.name}`}>
          <Text style={styles.text}>{line.name}</Text>
          {line.modifiers.length > 0 ? (
            <Text style={styles.muted}>{line.modifiers.map((m) => m.name).join(', ')}</Text>
          ) : null}
          <View style={styles.row}>
            <Button
              label="−"
              testID={`less-${i}`}
              kind="plain"
              onPress={() => cartStore.update((c) => setQuantity(c, i, line.quantity - 1))}
            />
            <Text style={styles.text} testID={`quantity-${i}`}>
              {line.quantity}
            </Text>
            <Button
              label="+"
              testID={`more-${i}`}
              kind="plain"
              onPress={() => cartStore.update((c) => setQuantity(c, i, line.quantity + 1))}
            />
            <Text style={styles.text}>{money({ cents: lineTotalCents(line), currency: line.currency })}</Text>
          </View>
          <Button
            label="Remove"
            testID={`remove-${i}`}
            kind="plain"
            onPress={() => cartStore.update((c) => removeLine(c, i))}
          />
        </View>
      ))}
      <Text style={styles.title} testID="cart-total">
        {`Estimated total ${money({ cents: estimatedTotalCents(cart), currency })}`}
      </Text>
      <Text style={styles.muted}>The bakery confirms the final price when you place the order.</Text>
      <Button label="Check out" testID="to-checkout" onPress={props.onCheckout} />
    </ScrollView>
  );
}
