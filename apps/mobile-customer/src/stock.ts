import type { FreshStockRead } from '@bakery/customer-core';
import { gql } from './api';
import { LISTING_STOCK, type ListingStockData } from './queries';

/**
 * The listing's stock, read again when a customer adds it to the order (WI-CUST-009). The app keeps no copy of a listing between screens, so every
 * read is from the network; this only turns the answer into the three cases `decideAdd` (customer-core) understands. Any failure is "failed", never
 * a guess that the item is fine.
 */
export async function readFreshStock(id: string): Promise<FreshStockRead> {
  try {
    const data = await gql<ListingStockData>(LISTING_STOCK, { id });
    return data.listing ? { kind: 'listing', stock: data.listing.stock } : { kind: 'missing' };
  } catch {
    return { kind: 'failed' };
  }
}
