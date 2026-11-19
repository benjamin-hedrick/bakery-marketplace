import Head from 'next/head';
import { ListingEditor } from '../../components/ListingEditor.tsx';
import { RequireLogin } from '../../components/RequireLogin.tsx';

/** A new listing (WI-CAT-008). Each visit is a new, empty form with its own idempotency key. */
export default function NewListingPage() {
  return (
    <>
      <Head>
        <title>Add a listing</title>
      </Head>
      <RequireLogin>
        <ListingEditor id={null} />
      </RequireLogin>
    </>
  );
}
