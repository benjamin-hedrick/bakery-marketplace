import type { ConflictView } from '@bakery/customer-core';

// The operations the app sends. The schema is services/graphql-bff/schema/schema.graphql, the same contract the web app uses.
export interface Money {
  cents: number;
  currency: string;
}
export type StockStatus = 'IN_STOCK' | 'LOW' | 'SOLD_OUT';

export const LISTINGS = `query Listings { listings(first: 20) { edges { node {
  id name category price { cents currency } stock { status } } } } }`;

export interface ListingRow {
  id: string;
  name: string;
  category: string;
  price: Money;
  stock: { status: StockStatus };
}
export interface ListingsData {
  listings: { edges: { node: ListingRow }[] };
}

export const LISTING = `query Listing($id: ID!) { listing(id: $id) {
  id vendorId name description category price { cents currency } stock { status maxPerOrder }
  modifiers { id name priceDelta { cents currency } } } }`;

export interface ListingDetailData {
  listing: {
    id: string;
    vendorId: string;
    name: string;
    description: string | null;
    category: string;
    price: Money;
    stock: { status: StockStatus; maxPerOrder: number | null };
    modifiers: { id: string; name: string; priceDelta: Money }[];
  } | null;
}

export const PICKUP_WINDOWS = `query PickupWindows($vendorId: ID!) { pickupWindows(vendorId: $vendorId) { start end } }`;
export interface PickupWindowsData {
  pickupWindows: { start: string; end: string }[];
}

export const PLACE_ORDER = `mutation PlaceOrder($input: PlaceOrderInput!) { placeOrder(input: $input) {
  __typename
  ... on PlaceOrderSuccess { order { id status } }
  ... on PlaceOrderRejected { code message fields { field message } shortfalls { listingId available } } } }`;
export interface PlaceOrderData {
  placeOrder:
    | { __typename: 'PlaceOrderSuccess'; order: { id: string; status: string } }
    | {
        __typename: 'PlaceOrderRejected';
        code: string;
        message: string;
        fields: { field: string; message: string }[];
        shortfalls: { listingId: string; available: number }[];
      };
}

export const ORDER = `query Order($id: ID!) { order(id: $id) {
  id status total { cents currency } pickupWindow { start end }
  lineItems { listingId modifierIds quantity price { cents currency } } } }`;
export interface OrderData {
  order: {
    id: string;
    status: string;
    total: Money;
    pickupWindow: { start: string; end: string } | null;
    lineItems: { listingId: string; modifierIds: string[]; quantity: number; price: Money }[];
  } | null;
}

export const LINE_NAME = `query LineName($id: ID!) { listing(id: $id) { name modifiers { id name } } }`;
export interface LineNameData {
  listing: { name: string; modifiers: { id: string; name: string }[] } | null;
}

// ---- allergens (WI-MOB-002): the registry's labels, what each listing contains, the caller's profile and the check of a cart against it ----
export const ALLERGEN_TAGS = `query AllergenTags { tags(kind: ALLERGEN) { id label } }`;
export interface AllergenTagsData {
  tags: { id: string; label: string }[];
}

export const LISTING_ALLERGENS = `query ListingAllergens($id: ID!) { listing(id: $id) { id allergenFlags modifiers { id allergens } } }`;
export interface ListingAllergensData {
  listing: { id: string; allergenFlags: string[]; modifiers: { id: string; allergens: string[] }[] } | null;
}

export const PROFILE = `query Profile { preferences { allergies avoid prefer } }`;
export interface ProfileData {
  preferences: { allergies: string[]; avoid: string[]; prefer: string[] };
}

export const CART_CHECK = `query CartCheck($lines: [CartLineInput!]!) { cartCheck(lines: $lines) {
  listingId found conflicts { allergenId severity source optionIds } } }`;
export interface CartCheckData {
  cartCheck: {
    listingId: string;
    found: boolean;
    conflicts: ConflictView[];
  }[];
}
