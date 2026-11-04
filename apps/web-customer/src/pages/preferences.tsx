import Head from 'next/head';
import { PreferencesForm } from '../components/PreferencesForm';
import { RequireLogin } from '../components/RequireLogin';
import { useIsClient } from '../lib/useIsClient';

/**
 * The customer's allergen profile (WI-CUST-005). Client-rendered behind the login, like the orders: the server never holds a user token
 * (ADR-0012), and the profile is private, so there is nothing for the server to render or cache.
 */
export default function PreferencesPage() {
  const isClient = useIsClient();

  return (
    <main>
      <Head>
        <title>Your allergies</title>
      </Head>
      <h1>Your allergies</h1>
      {isClient ? (
        <RequireLogin>
          <PreferencesForm />
        </RequireLogin>
      ) : (
        <p>Loading your allergen choices…</p>
      )}
    </main>
  );
}
