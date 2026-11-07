import type { GetServerSideProps } from 'next';
import { fetchQuery } from 'relay-runtime';
import { ListingsPage, listingsPageQuery } from '../components/ListingsPage';
import {
  createServerEnvironment,
  forwardTestHeaders,
  GraphQLRequestError,
  snapshotRecords,
} from '../lib/relay/environment';
import { parseTagQuery } from '@bakery/customer-core';

// The public listing page, optionally narrowed by ?tag=a&tag=b (WI-TAG-003). Still anonymous and rendered on the server; a tag the catalog refuses (unknown,
// hidden, retired, out of its window, an allergen) leads back to the unfiltered page rather than to an error.
export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  // Explicit, not the framework's default (ADR-0014 layer 3, WI-PORT-004): the page shows stock, so no browser, proxy or CDN may reuse it.
  res.setHeader('Cache-Control', 'private, no-store');
  const tags = parseTagQuery(query.tag);
  const environment = createServerEnvironment(forwardTestHeaders(req.headers));
  try {
    await fetchQuery(environment, listingsPageQuery, { tags: tags.length > 0 ? tags : null }).toPromise();
  } catch (e) {
    if (tags.length > 0 && e instanceof GraphQLRequestError && e.codes.includes('BAD_INPUT')) {
      return { redirect: { destination: '/', permanent: false } };
    }
    throw e;
  }
  return { props: { relayRecords: snapshotRecords(environment), tags } };
};

export default function Home({ tags }: { tags: string[] }) {
  return <ListingsPage tags={tags} />;
}
