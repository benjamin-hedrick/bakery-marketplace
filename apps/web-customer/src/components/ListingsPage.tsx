import Head from 'next/head';
import { graphql, useLazyLoadQuery } from 'react-relay';
import type { ListingsPageQuery } from '../__generated__/ListingsPageQuery.graphql';
import { ListingsList } from './ListingsList';

export const listingsPageQuery = graphql`
  query ListingsPageQuery {
    ...ListingsList_query
  }
`;

export function ListingsPage() {
  const data = useLazyLoadQuery<ListingsPageQuery>(listingsPageQuery, {});
  return (
    <main>
      <Head>
        <title>Fresh from local bakeries</title>
      </Head>
      <h1>Fresh from local bakeries</h1>
      <ListingsList query={data} />
    </main>
  );
}
