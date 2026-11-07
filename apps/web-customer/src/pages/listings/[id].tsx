import type { GetServerSideProps } from 'next';
import { fetchQuery } from 'relay-runtime';
import type { ListingDetailQuery$data } from '../../__generated__/ListingDetailQuery.graphql';
import { ListingDetail, listingDetailQuery } from '../../components/ListingDetail';
import { createServerEnvironment, forwardTestHeaders, snapshotRecords } from '../../lib/relay/environment';

export const getServerSideProps: GetServerSideProps = async ({ req, res, params }) => {
  // Explicit, not the framework's default (ADR-0014 layer 3, WI-PORT-004): the page shows stock, so no browser, proxy or CDN may reuse it. Also for the 404.
  res.setHeader('Cache-Control', 'private, no-store');
  const id = String(params?.id ?? '');
  const environment = createServerEnvironment(forwardTestHeaders(req.headers));
  const data = (await fetchQuery(environment, listingDetailQuery, { id }).toPromise()) as
    ListingDetailQuery$data | undefined;
  if (!data?.listing) return { notFound: true };
  return { props: { relayRecords: snapshotRecords(environment), id } };
};

export default function ListingPage({ id }: { id: string }) {
  return <ListingDetail id={id} />;
}
