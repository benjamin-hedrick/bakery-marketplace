import Link from 'next/link';
import { graphql, useLazyLoadQuery } from 'react-relay';
import type { ListingDetailQuery } from '../__generated__/ListingDetailQuery.graphql';
import { formatMoney } from '../lib/money';
import { StockBadge } from './StockBadge';

export const listingDetailQuery = graphql`
  query ListingDetailQuery($id: ID!) {
    listing(id: $id) {
      id
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
  if (!listing)
    return (
      <main>
        <p>Listing not found.</p>
      </main>
    );
  return (
    <main>
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
      <h2>Options</h2>
      <ul>
        {listing.modifiers.map((m) => (
          <li key={m.id}>
            {m.name} (+{formatMoney(m.priceDelta)}){m.allergens.length ? ` — contains ${m.allergens.join(', ')}` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
