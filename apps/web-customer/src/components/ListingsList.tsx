import { useTransition } from 'react';
import Link from 'next/link';
import { graphql, useRefetchableFragment } from 'react-relay';
import type { ListingsList_query$key } from '../__generated__/ListingsList_query.graphql';
import { formatMoney } from '../lib/money';
import { StockBadge } from './StockBadge';

const fragment = graphql`
  fragment ListingsList_query on Query @refetchable(queryName: "ListingsListRefetchQuery") {
    listings(first: 20) {
      edges {
        node {
          id
          name
          category
          price {
            cents
            currency
          }
          allergenFlags
          stock {
            status
          }
        }
      }
    }
  }
`;

export function ListingsList({ query }: { query: ListingsList_query$key }) {
  const [data, refetch] = useRefetchableFragment(fragment, query);
  const [isPending, startTransition] = useTransition();

  return (
    <section aria-busy={isPending}>
      <button
        type="button"
        onClick={() =>
          startTransition(() => {
            refetch({}, { fetchPolicy: 'network-only' });
          })
        }
      >
        Refresh
      </button>
      <ul>
        {data.listings.edges.map(({ node }) => (
          <li key={node.id} data-testid="listing">
            <Link href={`/listings/${encodeURIComponent(node.id)}`}>{node.name}</Link>{' '}
            <span data-testid="price">{formatMoney(node.price)}</span> <StockBadge status={node.stock.status} />{' '}
            <small>
              {node.category}
              {node.allergenFlags.length ? ` · contains ${node.allergenFlags.join(', ')}` : ''}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
