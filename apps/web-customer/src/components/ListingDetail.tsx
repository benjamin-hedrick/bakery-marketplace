import Head from 'next/head';
import Link from 'next/link';
import { graphql, useLazyLoadQuery } from 'react-relay';
import type { ListingDetailQuery } from '../__generated__/ListingDetailQuery.graphql';
import { formatMoney } from '../lib/money';
import { AddToOrder } from './AddToOrder';
import { ConflictMarks } from './ConflictMarks';
import { StockBadge } from './StockBadge';
import { usePersonalizedListing } from './usePersonalization';

export const listingDetailQuery = graphql`
  query ListingDetailQuery($id: ID!) {
    listing(id: $id) {
      id
      vendorId
      name
      description
      category
      price {
        cents
        currency
      }
      allergenFlags
      stock {
        status
        maxPerOrder
      }
      modifiers {
        id
        name
        priceDelta {
          cents
          currency
        }
        allergens
      }
    }
  }
`;

export function ListingDetail({ id }: { id: string }) {
  const { listing } = useLazyLoadQuery<ListingDetailQuery>(listingDetailQuery, { id });
  // The customer's own conflicts for this item and its options (WI-CUST-006); null for everyone else, and the page is then as it was.
  const personal = usePersonalizedListing(id);
  const itemMarks = personal?.marks.filter((m) => m.optionIds.length === 0) ?? [];
  const optionMarks = new Map<string, typeof itemMarks>();
  for (const mark of personal?.marks ?? [])
    for (const optionId of mark.optionIds) optionMarks.set(optionId, [...(optionMarks.get(optionId) ?? []), mark]);
  if (!listing)
    return (
      <main>
        <Head>
          <title>Listing not found</title>
        </Head>
        <p>Listing not found.</p>
      </main>
    );
  return (
    <main>
      <Head>
        <title>{listing.name}</title>
      </Head>
      <p>
        <Link href="/">← All listings</Link>
      </p>
      <h1>{listing.name}</h1>
      <p>{listing.description}</p>
      <p data-testid="detail-price">{formatMoney(listing.price)}</p>
      <p>
        <StockBadge status={listing.stock.status} />
        {listing.stock.maxPerOrder ? ` · up to ${listing.stock.maxPerOrder} per order` : ''}
      </p>
      <p>Allergens: {listing.allergenFlags.join(', ') || 'none flagged'}</p>
      {personal ? (
        <section aria-label="Your allergens" data-testid="personal-detail">
          <ConflictMarks marks={itemMarks} />
          <p data-testid="personal-reminder">
            Marked from what the bakery has listed. An item or option without a mark is not guaranteed free of your
            allergens, so check with the bakery when it matters.
          </p>
        </section>
      ) : null}
      <AddToOrder listing={listing} optionMarks={optionMarks} />
    </main>
  );
}
