import type { GetServerSideProps } from 'next';
import { fetchQuery } from 'relay-runtime';
import { ListingsPage, listingsPageQuery } from '../components/ListingsPage';
import { createServerEnvironment, forwardTestHeaders, snapshotRecords } from '../lib/relay/environment';

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const environment = createServerEnvironment(forwardTestHeaders(req.headers));
  await fetchQuery(environment, listingsPageQuery, {}).toPromise();
  return { props: { relayRecords: snapshotRecords(environment) } };
};

export default function Home() {
  return <ListingsPage />;
}
