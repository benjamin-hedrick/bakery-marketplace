// Deterministic fixtures. Fixture A mirrors the first-slice seed (contract §7, prices in integer cents).
// Fixture B shares no names or IDs with A, so any cross-request leak is detectable.
const gid = (type, id) => Buffer.from(`${type}:${id}`).toString('base64');

const listing = (id, vendorId, name, category, priceCents, modifiers, allergenFlags) => ({
  __typename: 'Listing',
  id: gid('Listing', id),
  vendorId,
  name,
  description: `${name} (fixture)`,
  category,
  priceCents,
  modifiers: modifiers.map(([mid, mname, delta, allergens]) => ({
    id: gid('Modifier', mid),
    name: mname,
    priceDeltaCents: delta,
    allergens,
  })),
  allergenFlags,
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
    ),
    listing(
      'listing-croissant-001',
      'vendor-shop-001',
      'Almond Croissant',
      'Pastry',
      450,
      [['mod-extra-almond', 'Extra almond', 75, ['tree-nut']]],
      ['gluten', 'dairy', 'tree-nut'],
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
    listing('listing-roll-900', 'vendor-b-900', 'Cinnamon Roll', 'Pastry', 400, [], ['gluten', 'dairy']),
    listing('listing-brew-900', 'vendor-b-901', 'Cold Brew', 'Coffee', 450, [['mod-oat', 'Oat milk', 60, []]], []),
  ],
};
