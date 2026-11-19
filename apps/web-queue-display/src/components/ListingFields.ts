import { graphql, readInlineData } from 'react-relay';
import type {
  ListingFields_listing$data,
  ListingFields_listing$key,
} from '../__generated__/ListingFields_listing.graphql';
import type { LoadedListing } from '../lib/listings';

// The fields of a vendor's own listing (the BFF's MyListing, WI-CAT-007) that the list, the form and every write's answer read. Inline, so each
// operation selects them once and the screens read them as plain data. Only MyListing is ever read here: the public Listing type has no count,
// threshold or edit version, and these screens never ask for it.
const listingFields = graphql`
  fragment ListingFields_listing on MyListing @inline {
    id
    name
    description
    category
    price {
      cents
      currency
    }
    status
    allergenFlags
    tags {
      id
      label
    }
    modifiers {
      id
      name
      priceDelta {
        cents
      }
      allergens
      tags {
        id
      }
    }
    stock {
      status
      maxPerOrder
      availableQuantity
      lowStockThreshold
    }
    editVersion
    updatedAt
  }
`;

export function readListing(ref: ListingFields_listing$key): LoadedListing {
  const data: ListingFields_listing$data = readInlineData(listingFields, ref);
  return data;
}
