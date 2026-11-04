import Head from 'next/head';
import { OrderHistory } from '../../components/OrderHistory';
import { RequireLogin } from '../../components/RequireLogin';
import { useIsClient } from '../../lib/useIsClient';

/**
 * The customer's orders (WI-CUST-007). Client-rendered behind the login, like a single order: the server never holds a user token
 * (ADR-0012, item 26), and a customer's orders are private, so there is nothing for the server to render or cache.
 */
export default function OrdersPage() {
  const isClient = useIsClient();

  return (
    <main>
      <Head>
        <title>Your orders</title>
      </Head>
      <h1>Your orders</h1>
      {isClient ? (
        <RequireLogin>
          <OrderHistory />
        </RequireLogin>
      ) : (
        <p>Loading your orders…</p>
      )}
    </main>
  );
}
