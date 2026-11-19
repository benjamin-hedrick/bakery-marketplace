import Head from 'next/head';
import { useRouter } from 'next/router';
import { ListingEditor } from '../../components/ListingEditor.tsx';
import { RequireLogin } from '../../components/RequireLogin.tsx';

/**
 * One of the vendor's listings (WI-CAT-008). The id in the address is the listing's global id; the BFF decodes it and the catalog answers only for the
 * vendor's own listing, so another vendor's id, or one that is not an id at all, shows "not found".
 */
export default function EditListingPage() {
  const router = useRouter();
  const raw = router.query['id'];
  const id = typeof raw === 'string' ? raw : null;
  return (
    <>
      <Head>
        <title>Edit listing</title>
      </Head>
      <RequireLogin>
        {router.isReady && id !== null ? <ListingEditor key={id} id={id} /> : <p>Loading the listing…</p>}
      </RequireLogin>
    </>
  );
}
