import type { CatalogClient, CatalogListing } from './catalog-client.ts';
import type { TraceContext } from './trace.ts';

export interface Context {
  catalog: CatalogClient;
  trace: TraceContext;
}

const MAX_PAGE = 50;
const money = (cents: number, currency = 'USD') => ({ cents, currency });

// Mapping only (ADR-0013): field renames and shape changes. No pricing, availability or visibility rules live here.
const toListing = (l: CatalogListing) => ({
  __typename: 'Listing',
  id: l.id,
  vendorId: l.vendorId,
  name: l.name,
  description: l.description,
  category: l.category,
  price: money(l.priceCents, l.currency),
  modifiers: l.modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    priceDelta: money(m.priceDeltaCents, l.currency),
    allergens: m.allergens,
  })),
  allergenFlags: l.allergenFlags,
});

export const rootValue = {
  async listings(args: { first?: number; after?: string | null }, ctx: Context) {
    const first = Math.min(Math.max(args.first ?? 20, 1), MAX_PAGE);
    const page = await ctx.catalog.list({ limit: first, after: args.after ?? undefined }, ctx.trace);
    const edges = page.items.map((l) => ({ cursor: l.id, node: toListing(l) }));
    return {
      edges,
      pageInfo: { hasNextPage: page.nextCursor != null, endCursor: page.nextCursor ?? edges.at(-1)?.cursor ?? null },
    };
  },
  async listing(args: { id: string }, ctx: Context) {
    const l = await ctx.catalog.get(args.id, ctx.trace);
    return l ? toListing(l) : null;
  },
  // Only Listing implements Node in this slice; the ids are catalog listing ids.
  async node(args: { id: string }, ctx: Context) {
    const l = await ctx.catalog.get(args.id, ctx.trace);
    return l ? toListing(l) : null;
  },
};
