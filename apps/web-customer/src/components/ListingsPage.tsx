import Head from 'next/head';
import { graphql, useLazyLoadQuery } from 'react-relay';
import type { ListingsPageQuery } from '../__generated__/ListingsPageQuery.graphql';
import { ListingsList } from './ListingsList';

export const listingsPageQuery = graphql`
  query ListingsPageQuery($tags: [ID!]) {
    ...ListingsList_query @arguments(tags: $tags)
  }
`;

/** `tags` are the tag ids in the address (WI-TAG-003); the same ones the server rendered with, so the page hydrates onto what it was given. */
export function ListingsPage({ tags }: { tags: readonly string[] }) {
  const data = useLazyLoadQuery<ListingsPageQuery>(listingsPageQuery, { tags: tags.length > 0 ? [...tags] : null });
  return (
    <main>
      <Head>
        <title>Fresh from local bakeries</title>
      </Head>
      <h1>Fresh from local bakeries</h1>
      <ListingsList query={data} selectedTags={tags} />
    </main>
  );
}
