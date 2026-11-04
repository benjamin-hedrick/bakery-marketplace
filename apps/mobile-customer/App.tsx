import { cartCount } from '@bakery/customer-core';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, StatusBar as NativeStatusBar, Text, View } from 'react-native';
import { restoreSession, signOut, useAuthState } from './src/auth/session';
import { cartStore, useCart } from './src/cart';
import { CartScreen } from './src/screens/CartScreen';
import { CheckoutScreen } from './src/screens/CheckoutScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { ListingsScreen } from './src/screens/ListingsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OrderScreen } from './src/screens/OrderScreen';
import { Button, Loading, colors, styles } from './src/ui';

// The app draws edge to edge on Android, so the header starts below the status bar (no native safe-area library: it needs a native build step that
// overflows Windows path limits).
const TOP_INSET = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 0;

type Route =
  | { name: 'listings' }
  | { name: 'detail'; id: string }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'order'; id: string };

const TITLES: Record<Route['name'], string> = {
  listings: 'Menu',
  detail: 'Item',
  cart: 'Your order',
  checkout: 'Checkout',
  order: 'Order',
};

export default function App() {
  const auth = useAuthState();
  const cart = useCart();
  const [stack, setStack] = useState<Route[]>([{ name: 'listings' }]);
  const route = stack[stack.length - 1]!;

  const push = (r: Route) => setStack((s) => [...s, r]);
  const reset = (r: Route) => setStack([r]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  useEffect(() => void restoreSession(), []);
  useEffect(() => {
    if (auth === 'signedOut') {
      cartStore.clear(); // nothing of the customer's order stays on the device after sign-out (ADR-0014)
      setStack([{ name: 'listings' }]);
    }
  }, [auth]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length]);

  if (auth === 'starting') return <Loading />;
  if (auth === 'signedOut') return <LoginScreen />;

  return (
    <View style={[styles.screen, { paddingTop: TOP_INSET }]}>
      <StatusBar style="dark" />
      <View style={[styles.row, { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line }]}>
        {stack.length > 1 ? <Button label="‹ Back" testID="back" kind="plain" compact onPress={back} /> : <View />}
        <Text style={[styles.title, { fontSize: 18 }]} testID="screen-title">
          {TITLES[route.name]}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={`Order (${cartCount(cart)})`}
            testID="open-cart"
            kind="plain"
            compact
            onPress={() => route.name !== 'cart' && push({ name: 'cart' })}
          />
          <Button label="Sign out" testID="sign-out" kind="plain" compact onPress={() => void signOut()} />
        </View>
      </View>
      {route.name === 'listings' && <ListingsScreen onOpen={(id) => push({ name: 'detail', id })} />}
      {route.name === 'detail' && <DetailScreen id={route.id} onAdded={() => push({ name: 'cart' })} />}
      {route.name === 'cart' && (
        <CartScreen onCheckout={() => push({ name: 'checkout' })} onBrowse={() => reset({ name: 'listings' })} />
      )}
      {route.name === 'checkout' && <CheckoutScreen onPlaced={(id) => reset({ name: 'order', id })} onBack={back} />}
      {route.name === 'order' && <OrderScreen id={route.id} onBrowse={() => reset({ name: 'listings' })} />}
    </View>
  );
}
