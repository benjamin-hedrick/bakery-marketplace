// Deterministic fixtures. Fixture A mirrors the first-slice seed (contract §7, prices in integer cents).
// Fixture B shares no names or IDs with A, so any cross-request leak is detectable.
// Like the real BFF (D-9, D-B): a listing's id is a Relay global id (made in server.mjs), a modifier's id and a vendor id are the raw service ids.

const IN_STOCK = { status: 'IN_STOCK', maxPerOrder: null };

// The tags a catalog response carries (WI-TAG-002): id, kind and label, as the real BFF maps them.
export const TAGS = {
  vegan: { id: 'vegan', kind: 'DIET', label: 'Vegan' },
  vegetarian: { id: 'vegetarian', kind: 'DIET', label: 'Vegetarian' },
  autumn: { id: 'autumn', kind: 'SEASON', label: 'Autumn' },
  'local-favourite': { id: 'local-favourite', kind: 'THEME', label: 'Local favourite' },
};
const tagsOf = (ids = []) => ids.map((id) => TAGS[id]);

const listing = (
  id,
  vendorId,
  name,
  category,
  priceCents,
  modifiers,
  allergenFlags,
  stock = IN_STOCK,
  tags = [],
  optionTags = {},
) => ({
  __typename: 'Listing',
  id, // the raw service id: server.mjs turns it into the Relay global id once, as the real BFF does
  vendorId,
  name,
  description: `${name} (fixture)`,
  category,
  priceCents,
  modifiers: modifiers.map(([mid, mname, delta, allergens]) => ({
    id: mid,
    name: mname,
    priceDeltaCents: delta,
    allergens,
    tags: tagsOf(optionTags[mid]),
  })),
  allergenFlags,
  tags: tagsOf(tags),
  stock,
});

export const fixtures = {
  A: [
    listing(
      'listing-sourdough-001',
      'vendor-shop-001',
      'Country Sourdough',
      'Bread',
      800,
      [
        ['mod-seeds', 'Seed crust', 100, ['sesame']],
        ['mod-sliced', 'Sliced', 0, []],
      ],
      ['gluten'],
      { status: 'IN_STOCK', maxPerOrder: 4 },
      ['vegan', 'local-favourite'],
      { 'mod-seeds': ['vegan'] },
    ),
    listing(
      'listing-croissant-001',
      'vendor-shop-001',
      'Almond Croissant',
      'Pastry',
      450,
      [['mod-extra-almond', 'Extra almond', 75, ['tree-nut']]],
      ['gluten', 'dairy', 'tree-nut'],
      { status: 'LOW', maxPerOrder: null },
      ['vegetarian', 'autumn'],
    ),
    listing(
      'listing-latte-001',
      'vendor-indep-001',
      'Oat Milk Latte',
      'Coffee',
      500,
      [
        ['mod-extra-shot', 'Extra shot', 75, []],
        ['mod-vanilla', 'Vanilla', 50, []],
      ],
      [],
      undefined,
      [],
    ),
  ],
  B: [
    listing(
      'listing-rye-900',
      'vendor-b-900',
      'Dark Rye Loaf',
      'Bread',
      700,
      [['mod-caraway', 'Caraway', 25, []]],
      ['gluten'],
    ),
    listing(
      'listing-roll-900',
      'vendor-b-900',
      'Cinnamon Roll',
      'Pastry',
      400,
      [['mod-icing', 'Icing', 50, ['dairy']]],
      ['gluten', 'dairy'],
      { status: 'SOLD_OUT', maxPerOrder: null },
    ),
    listing('listing-brew-900', 'vendor-b-901', 'Cold Brew', 'Coffee', 450, [['mod-oat', 'Oat milk', 60, []]], []),
  ],
};
