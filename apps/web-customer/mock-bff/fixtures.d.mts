// Types for fixtures.mjs, so the browser tests can count from the mock's own fixtures instead of writing the counts down (register 178).

export interface FixtureTag {
  id: string;
  kind: string;
  label: string;
}

export interface FixtureListing {
  id: string;
  vendorId: string;
  name: string;
  allergenFlags: string[];
  tags: FixtureTag[];
  modifiers: { id: string; name: string; allergens: string[]; tags: FixtureTag[] }[];
  stock: { status: string; maxPerOrder: number | null };
}

export const TAGS: Record<string, FixtureTag>;
export const fixtures: { A: FixtureListing[]; B: FixtureListing[] };
