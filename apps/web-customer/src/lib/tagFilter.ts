// The tag filter of the home page (WI-TAG-003): which tags are in the address, and the address that adds or removes one. The catalog decides which tags may be
// used and refuses the rest; this only keeps what the address says tidy (distinct, lower case, in the shape of an id, not more than the page will ask for), so a
// hostile or mistyped address cannot make the page send something odd. Pure, so it is unit tested.

export const MAX_FILTER_TAGS = 10;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The tag ids in a query string value (`?tag=a&tag=b` arrives as an array, a single one as a string). */
export function parseTagQuery(value: string | string[] | undefined): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const entry of raw) {
    const id = entry.trim().toLowerCase();
    if (ID.test(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_FILTER_TAGS) break;
  }
  return ids;
}

/** The selected ids with `id` toggled: removed when it is there, added at the end when it is not (up to the limit). */
export function toggleTag(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  return selected.length >= MAX_FILTER_TAGS ? [...selected] : [...selected, id];
}

/** The home page address for a selection: `/` with no tags, `/?tag=a&tag=b` otherwise. */
export function filterHref(selected: readonly string[]): { pathname: string; query: { tag?: string[] } } {
  return { pathname: '/', query: selected.length > 0 ? { tag: [...selected] } : {} };
}
