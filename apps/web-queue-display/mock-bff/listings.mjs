// The vendor's listing operations of the mock BFF (WI-CAT-008 browser tests). It keeps listings in memory and answers the BFF's myListings, myListing,
// createListing, updateListing, adjustListingStock and the public tags query the way the real BFF and catalog do, as far as the screens can tell:
// the edit version and its CHANGED, the idempotency key and its repeat and KEY_REUSED, the counted edit that may not carry a count, the count that may
// not go below zero, a listing of another vendor that looks missing, and a few of the catalog's field sentences. Tests steer it through
// POST /__state (listings, listingMode, listingDelayMs, verified, invalidFields) and POST /__listing (a change made elsewhere: another tab, a sale).
// Not used outside tests.

const PAGE = 20;
const MAX_PRICE = 10_000_000;
const DEFAULT_THRESHOLD = 5;

export const REGISTRY = [
  ['dairy', 'ALLERGEN', 'Milk (dairy)'],
  ['egg', 'ALLERGEN', 'Eggs'],
  ['tree-nut', 'ALLERGEN', 'Tree nuts'],
  ['peanut', 'ALLERGEN', 'Peanuts'],
  ['gluten', 'ALLERGEN', 'Gluten (wheat, rye, barley)'],
  ['sesame', 'ALLERGEN', 'Sesame'],
  ['vegan', 'DIET', 'Vegan'],
  ['vegetarian', 'DIET', 'Vegetarian'],
  ['local', 'THEME', 'Local'],
].map(([id, kind, label]) => ({ id, kind, label }));

const ALLERGEN_IDS = REGISTRY.filter((t) => t.kind === 'ALLERGEN').map((t) => t.id);
const label = (id) => REGISTRY.find((t) => t.id === id)?.label ?? id;

export const initialListings = () => ({
  listings: [], // { vendor: 'me' | 'other', key?, keyInput?, node }
  listingMode: 'ok', // ok | invalid | changed | conflict | notverified | error | slow | forbidden | lost (done, answer lost)
  listingDelayMs: 0,
  verified: true,
  invalidFields: [{ field: 'name', message: 'Name is required.' }],
  listingWrites: [], // each write received: { op, variables, authorization }
  nextListing: 1,
});

const gid = (serviceId) => Buffer.from(`Listing:${serviceId}`).toString('base64');

function stockOf(quantity, maxPerOrder, threshold) {
  const status =
    quantity === null || quantity === undefined
      ? 'IN_STOCK'
      : quantity <= 0
        ? 'SOLD_OUT'
        : quantity <= (threshold ?? DEFAULT_THRESHOLD)
          ? 'LOW'
          : 'IN_STOCK';
  return {
    status,
    maxPerOrder: maxPerOrder ?? null,
    availableQuantity: quantity ?? null,
    lowStockThreshold: threshold ?? null,
  };
}

/** A MyListing as the BFF answers it; override what a test cares about. */
export function listingNode(o) {
  const quantity = o.stock?.availableQuantity ?? null;
  return {
    __typename: 'MyListing',
    id: o.id,
    name: o.name ?? 'Country Sourdough',
    description: o.description ?? null,
    category: o.category ?? 'Bread',
    price: { cents: o.priceCents ?? 800, currency: 'USD' },
    status: o.status ?? 'DRAFT',
    allergenFlags: o.allergenFlags ?? [],
    tags: (o.tags ?? []).map((id) => ({
      id,
      kind: REGISTRY.find((t) => t.id === id)?.kind ?? 'THEME',
      label: label(id),
    })),
    modifiers: (o.modifiers ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      priceDelta: { cents: m.priceDeltaCents ?? 0, currency: 'USD' },
      allergens: m.allergens ?? [],
      tags: (m.tags ?? []).map((id) => ({ id, kind: 'THEME', label: label(id) })),
    })),
    stock: stockOf(quantity, o.stock?.maxPerOrder, o.stock?.lowStockThreshold),
    editVersion: o.editVersion ?? 1,
    createdAt: o.createdAt ?? '2026-11-18T09:00:00Z',
    updatedAt: o.updatedAt ?? '2026-11-18T09:00:00Z',
  };
}

const rejected = (code, fields = [], currentEditVersion = null) => ({
  __typename: 'ListingRejected',
  code,
  message: 'Fixed text from the BFF.',
  fields,
  currentEditVersion,
});
const success = (node) => ({ __typename: 'ListingWriteSuccess', listing: node });

/** Some of the catalog's checks, with its own sentences, so the screens can be seen to show them beside their fields. */
function validate(input, current) {
  const fields = [];
  if (!input.name || !input.name.trim()) fields.push({ field: 'name', message: 'Name is required.' });
  else if (input.name.trim().length > 120)
    fields.push({ field: 'name', message: 'Name must be at most 120 characters.' });
  if (!input.category || !input.category.trim()) fields.push({ field: 'category', message: 'Category is required.' });
  if (input.priceCents < 0 || input.priceCents > MAX_PRICE)
    fields.push({ field: 'priceCents', message: `Price must be between 0 and ${MAX_PRICE} cents.` });
  (input.allergenFlags ?? []).forEach((a, i) => {
    if (!ALLERGEN_IDS.includes(a))
      fields.push({
        field: `allergenFlags[${i}]`,
        message: `Not an allergen the catalog knows. Use one of: ${ALLERGEN_IDS.join(', ')}.`,
      });
  });
  (input.modifiers ?? []).forEach((m, i) => {
    if (!m.name || !m.name.trim())
      fields.push({ field: `modifiers[${i}].name`, message: 'Modifier name is required (max 120).' });
  });
  const stock = input.stock;
  if (stock) {
    const counted = current?.stock.availableQuantity !== null && current?.stock.availableQuantity !== undefined;
    if (
      stock.mode === 'COUNTED' &&
      current &&
      counted &&
      stock.availableQuantity !== undefined &&
      stock.availableQuantity !== null
    )
      fields.push({ field: 'stock.availableQuantity', message: 'Change the quantity with an adjustment.' });
    else if (
      stock.mode === 'COUNTED' &&
      (!current || !counted) &&
      (stock.availableQuantity === undefined || stock.availableQuantity === null)
    )
      fields.push({ field: 'stock.availableQuantity', message: 'A counted listing needs a starting quantity.' });
    if (stock.availableQuantity !== undefined && stock.availableQuantity !== null && stock.availableQuantity < 0)
      fields.push({
        field: 'stock.availableQuantity',
        message: 'Quantity must be between 0 and 1000000, or omitted for made to order.',
      });
    if (stock.maxPerOrder !== null && stock.maxPerOrder !== undefined && stock.maxPerOrder < 1)
      fields.push({ field: 'stock.maxPerOrder', message: 'Max per order must be between 1 and 1000000.' });
  }
  return fields;
}

function apply(node, input, now) {
  const counted = node.stock.availableQuantity !== null;
  let quantity = node.stock.availableQuantity;
  if (input.stock) {
    if (input.stock.mode === 'MADE_TO_ORDER') quantity = null;
    else if (!counted || input.stock.availableQuantity !== undefined)
      quantity = input.stock.availableQuantity ?? quantity;
  }
  return {
    ...node,
    name: input.name.trim(),
    description: input.description ?? null,
    category: input.category.trim(),
    price: { cents: input.priceCents, currency: 'USD' },
    status: input.status ?? node.status,
    allergenFlags: [...(input.allergenFlags ?? [])],
    tags: (input.tags ?? node.tags.map((t) => t.id)).map((id) => ({
      id,
      kind: REGISTRY.find((t) => t.id === id)?.kind ?? 'THEME',
      label: label(id),
    })),
    modifiers: (input.modifiers ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      priceDelta: { cents: m.priceDeltaCents, currency: 'USD' },
      allergens: m.allergens ?? [],
      tags: (m.tags ?? []).map((id) => ({ id, kind: 'THEME', label: label(id) })),
    })),
    stock: input.stock ? stockOf(quantity, input.stock.maxPerOrder, input.stock.lowStockThreshold) : node.stock,
    updatedAt: now,
  };
}

/** Answers a listing operation, or returns false when the query is not one. `state` is the mock's whole state. */
export async function answerListing(state, query, variables, authorization, send) {
  const op = [
    'ListingsListQuery',
    'ListingEditorQuery',
    'StockControlsRefreshQuery',
    'ListingWritesCreateMutation',
    'ListingWritesUpdateMutation',
    'ListingWritesAdjustMutation',
  ].find((name) => query.includes(name));
  if (!op) return false;
  const mine = state.listings.filter((l) => l.vendor === 'me');
  const find = (id) => mine.find((l) => l.node.id === id);

  if (op === 'ListingsListQuery') {
    const filtered = mine
      .filter((l) => !variables.status || l.node.status === variables.status)
      .sort((a, b) => (a.node.id < b.node.id ? -1 : 1))
      .filter((l) => !variables.after || l.node.id > variables.after);
    const page = filtered.slice(0, PAGE);
    send(200, {
      data: {
        myListings: {
          edges: page.map((l) => ({ cursor: l.node.id, node: l.node })),
          pageInfo: { hasNextPage: filtered.length > PAGE, endCursor: page.at(-1)?.node.id ?? null },
        },
      },
    });
    return true;
  }
  if (op === 'ListingEditorQuery' || op === 'StockControlsRefreshQuery') {
    send(200, { data: { myListing: find(variables.id)?.node ?? null } });
    return true;
  }

  // A write.
  state.listingWrites.push({ op, variables, authorization });
  if (state.listingDelayMs > 0) await new Promise((r) => setTimeout(r, state.listingDelayMs));
  if (state.listingMode === 'slow') return true; // never answers: the screen's own wait must end it
  if (state.listingMode === 'error') {
    send(500, { error: 'boom at http://catalog.internal' });
    return true;
  }
  if (state.listingMode === 'forbidden') {
    send(200, { errors: [{ message: 'Not allowed.', extensions: { code: 'FORBIDDEN' } }], data: null });
    return true;
  }
  const field =
    op === 'ListingWritesCreateMutation'
      ? 'createListing'
      : op === 'ListingWritesUpdateMutation'
        ? 'updateListing'
        : 'adjustListingStock';
  const done = (payload) => {
    // 'lost': the write is done, but its answer never reaches the screen (a timeout after the catalog stored it).
    if (state.listingMode === 'lost') send(502, { error: 'the answer was lost' });
    else send(200, { data: { [field]: payload } });
    return true;
  };
  if (state.listingMode === 'invalid') return done(rejected('INVALID', state.invalidFields));
  if (state.listingMode === 'notverified') return done(rejected('VENDOR_NOT_VERIFIED'));
  if (state.listingMode === 'conflict') return done(rejected('CHANGED'));
  const now = new Date().toISOString();

  if (op === 'ListingWritesCreateMutation') {
    const sent = JSON.stringify(variables.input);
    const earlier = state.listings.find((l) => l.vendor === 'me' && l.key === variables.key);
    if (earlier) return done(earlier.keyInput === sent ? success(earlier.node) : rejected('KEY_REUSED'));
    const fields = validate(variables.input, null);
    if (fields.length > 0) return done(rejected('INVALID', fields));
    if (variables.input.status === 'PUBLISHED' && !state.verified) return done(rejected('VENDOR_NOT_VERIFIED'));
    const id = gid(`listing-mock-${String(state.nextListing++).padStart(4, '0')}`);
    const base = listingNode({ id, createdAt: now, updatedAt: now });
    const node = apply(base, { ...variables.input, status: variables.input.status ?? 'DRAFT' }, now);
    state.listings.push({ vendor: 'me', key: variables.key, keyInput: sent, node: { ...node, editVersion: 1 } });
    return done(success({ ...node, editVersion: 1 }));
  }

  const listing = find(variables.id);
  if (!listing) return done(rejected('NOT_FOUND'));

  if (op === 'ListingWritesUpdateMutation') {
    if (state.listingMode === 'changed' || variables.version !== listing.node.editVersion)
      return done(rejected('CHANGED', [], listing.node.editVersion));
    const fields = validate(variables.input, listing.node);
    if (fields.length > 0) return done(rejected('INVALID', fields));
    if (variables.input.status === 'PUBLISHED' && listing.node.status !== 'PUBLISHED' && !state.verified)
      return done(rejected('VENDOR_NOT_VERIFIED'));
    listing.node = { ...apply(listing.node, variables.input, now), editVersion: listing.node.editVersion + 1 };
    return done(success(listing.node));
  }

  // adjust
  const quantity = listing.node.stock.availableQuantity;
  if (quantity === null) return done(rejected('MADE_TO_ORDER'));
  if (Math.abs(variables.delta) > 1_000_000)
    return done(rejected('INVALID', [{ field: 'delta', message: 'Delta must be between -1000000 and 1000000.' }]));
  if (quantity + variables.delta < 0) return done(rejected('INSUFFICIENT_STOCK'));
  listing.node = {
    ...listing.node,
    stock: stockOf(quantity + variables.delta, listing.node.stock.maxPerOrder, listing.node.stock.lowStockThreshold),
    updatedAt: now,
  };
  return done(success(listing.node));
}

/** A change made elsewhere (another tab's edit, a customer's order): `edit` moves the edit version on, `sold` takes units. */
export function changeElsewhere(state, { id, edit, sold }) {
  const listing = state.listings.find((l) => l.node.id === id);
  if (!listing) return false;
  if (edit) listing.node = { ...listing.node, ...edit, editVersion: listing.node.editVersion + 1 };
  if (sold) {
    const q = listing.node.stock.availableQuantity ?? 0;
    listing.node = {
      ...listing.node,
      stock: stockOf(q - sold, listing.node.stock.maxPerOrder, listing.node.stock.lowStockThreshold),
    };
  }
  return true;
}
