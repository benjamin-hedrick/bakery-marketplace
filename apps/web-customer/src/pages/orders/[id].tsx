import Head from 'next/head';
import { useRouter } from 'next/router';
import { OrderStatusView } from '../../components/OrderStatusView';
import { RequireLogin } from '../../components/RequireLogin';
import { useIsClient } from '../../lib/useIsClient';

/**
 * An order and its status (S1-04). Client-rendered behind the login: the server never holds a user token (ADR-0012, item 26), and an order
 * is private to its customer, so there is nothing for the server to render or cache.
 */
export default function OrderPage() {
  const router = useRouter();
  const isClient = useIsClient();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  return (
    <main>
      <Head>
        <title>Your order</title>
      </Head>
      <h1>Your order</h1>
      {isClient && router.isReady && id ? (
        <RequireLogin>
          <OrderStatusView id={id} />
        </RequireLogin>
      ) : (
        <p>Loading your order…</p>
      )}
    </main>
  );
}
