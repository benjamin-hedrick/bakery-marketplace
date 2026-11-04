import { useState, useTransition } from 'react';
import Link from 'next/link';
import { graphql, useRefetchableFragment } from 'react-relay';
import type { ListingsList_query$key } from '../__generated__/ListingsList_query.graphql';
import { formatMoney } from '../lib/money';
import { ConflictMarks } from './ConflictMarks';
import { StockBadge } from './StockBadge';
import { usePersonalizedList } from './usePersonalization';

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
  // The customer's own conflicts, laid over the public list after the login; null (nothing changes) for everyone else. Hiding is done here, instantly.
  const personalization = usePersonalizedList();
  const [hide, setHide] = useState(false);
  const all = data.listings.edges;
  const shown = personalization && hide ? all.filter(({ node }) => !personalization.get(node.id)?.itemConflict) : all;
  const hiddenCount = all.length - shown.length;

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
      {personalization ? (
        <div data-testid="personal-panel">
          <p data-testid="personal-reminder">
            Items are marked from what the bakery has listed. An item without a mark is not guaranteed free of your
            allergens, so check with the bakery when it matters.
          </p>
          <label>
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Hide items that list an
            allergen from my profile
          </label>
          <p role="status" data-testid="hidden-count">
            {hide ? `${hiddenCount} ${hiddenCount === 1 ? 'item' : 'items'} hidden.` : ''}
          </p>
        </div>
      ) : null}
      <ul>
        {shown.map(({ node }) => (
          <li key={node.id} data-testid="listing">
            <Link href={`/listings/${encodeURIComponent(node.id)}`}>
              {node.name}
              {personalization?.get(node.id)?.marks.length ? (
                <>
                  {' — '}
                  <ConflictMarks marks={personalization.get(node.id)!.marks} />
                </>
              ) : null}
            </Link>{' '}
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
