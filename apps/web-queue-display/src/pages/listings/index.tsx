import Head from 'next/head';
import { ListingsList } from '../../components/ListingsList.tsx';
import { RequireLogin } from '../../components/RequireLogin.tsx';

/** The vendor's own listings (WI-CAT-008). Client-rendered, like the queue: a vendor's listings are never rendered on the server. */
export default function ListingsPage() {
  return (
    <>
      <Head>
        <title>Your listings</title>
      </Head>
      <RequireLogin>
        <ListingsList />
      </RequireLogin>
    </>
  );
}
