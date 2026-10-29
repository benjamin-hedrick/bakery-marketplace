import Head from 'next/head';
import { CheckoutForm } from '../components/CheckoutForm';
import { RequireLogin } from '../components/RequireLogin';
import { useIsClient } from '../lib/useIsClient';

/**
 * The checkout (S1-03). Client-rendered: it needs the login, and the server never holds a user token (ADR-0012, item 26). The server HTML is
 * only the heading and the test banner; the form appears after hydration, because it fetches pickup times through Relay in the browser.
 */
export default function CheckoutPage() {
  const isClient = useIsClient();

  return (
    <main>
      <Head>
        <title>Your order</title>
      </Head>
      <h1>Your order</h1>
      <p role="note" data-testid="test-banner">
        <strong>Test checkout.</strong> No real payment is taken and no real food is prepared.
      </p>
      {isClient ? (
        <RequireLogin>
          <CheckoutForm />
        </RequireLogin>
      ) : (
        <p>Loading your order…</p>
      )}
    </main>
  );
}
