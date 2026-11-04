import { useState, useTransition } from 'react';
import Link from 'next/link';
import { graphql, useRefetchableFragment } from 'react-relay';
import type { ListingsList_query$key } from '../__generated__/ListingsList_query.graphql';
import { formatMoney } from '../lib/money';
import { ConflictMarks } from './ConflictMarks';
import { filterHref, toggleTag } from '../lib/tagFilter';
import { TagChips } from './TagChips';
import { StockBadge } from './StockBadge';
import { usePersonalizedList } from './usePersonalization';

const fragment = graphql`
  fragment ListingsList_query on Query
  @refetchable(queryName: "ListingsListRefetchQuery")
  @argumentDefinitions(tags: { type: "[ID!]" }) {
    tags {
      id
      kind
      label
    }
    listings(first: 20, tags: $tags) {
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
          tags {
            id
            kind
            label
          }
          stock {
            status
          }
        }
      }
    }
  }
`;

export function ListingsList({
  query,
  selectedTags,
}: {
  query: ListingsList_query$key;
  selectedTags: readonly string[];
}) {
  const [data, refetch] = useRefetchableFragment(fragment, query);
  const [isPending, startTransition] = useTransition();
  // The customer's own conflicts, laid over the public list after the login; null (nothing changes) for everyone else. Hiding is done here, instantly.
  const personalization = usePersonalizedList();
  const [hide, setHide] = useState(false);
  const all = data.listings.edges;
  // The tags a customer can narrow by: what the catalog shows today, without allergens (they are not tags; ADR-0022).
  const filterable = data.tags.filter((t) => t.kind !== 'ALLERGEN');
  const shown = personalization && hide ? all.filter(({ node }) => !personalization.get(node.id)?.itemConflict) : all;
  const hiddenCount = all.length - shown.length;

  return (
    <section aria-busy={isPending}>
      <button
        type="button"
        onClick={() =>
          startTransition(() => {
            refetch({ tags: selectedTags.length > 0 ? [...selectedTags] : null }, { fetchPolicy: 'network-only' });
          })
        }
      >
        Refresh
      </button>
      {filterable.length > 0 ? (
        <nav aria-label="Filter by tag" data-testid="tag-filter">
          <ul className="tag-chips tag-filters">
            {filterable.map((tag) => {
              const on = selectedTags.includes(tag.id);
              return (
                <li key={tag.id} className="tag-chip">
                  {/* A plain link: the page stays anonymous and cacheable, and the address says what is filtered. */}
                  <Link
                    href={filterHref(toggleTag(selectedTags, tag.id))}
                    data-testid="tag-filter-link"
                    data-selected={on}
                    {...(on ? { 'aria-current': 'true' as const } : {})}
                  >
                    {tag.label}
                    {on ? <span> (selected, select again to remove)</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {selectedTags.length > 0 ? (
            <Link href={filterHref([])} data-testid="tag-filter-clear">
              Clear filters
            </Link>
          ) : null}
        </nav>
      ) : null}
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
      {all.length === 0 && selectedTags.length > 0 ? (
        <p data-testid="no-match">
          No listings match these tags. <Link href={filterHref([])}>Clear filters</Link>
        </p>
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
            <TagChips tags={node.tags} />
          </li>
        ))}
      </ul>
    </section>
  );
}
