// The words for the diets a customer prefers (WI-TAG-004, ADR-0022). A diet is the bakery's claim, so every sentence says what the BAKERY has marked and never what
// the product checked: "not marked vegan" is not "not vegan", and nothing here says an item is suitable, safe or free of anything. Pure, so it is unit tested.

export interface DietNote {
  tagId: string;
  /** The registry's label for the diet ("Vegan"). */
  label: string;
  /** Marked for the diet as configured (the item and every chosen option carry the tag). */
  marked: boolean;
  /** The item itself carries the tag. */
  itemMarked: boolean;
  /** Names of the options without the tag (all of them for browse and detail, the chosen ones for a cart). */
  optionNames: readonly string[];
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const joinNames = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** The quiet line on a listing in the list: the bakery's claim when it has made it, "not marked" when it has not. */
export function dietListText(note: DietNote): string {
  return note.marked ? `${note.label}, marked by the bakery` : `Not marked ${lower(note.label)} by the bakery`;
}

/** On the detail page: the options that would remove a claim the item does make. Nothing when the item makes no claim or no option removes it. */
export function dietOptionWarnings(note: DietNote): string[] {
  if (!note.itemMarked || note.optionNames.length === 0) return [];
  return note.optionNames.map(
    (name) =>
      `${name} is not marked ${lower(note.label)}, so adding it removes the bakery's ${lower(note.label)} claim`,
  );
}

/** In the cart: why a line is not marked for a preferred diet, or null when it is. */
export function dietCartText(lineName: string, note: DietNote): string | null {
  if (note.marked) return null;
  if (!note.itemMarked) return `${lineName} is not marked ${lower(note.label)} by the bakery`;
  return `${lineName} with ${joinNames(note.optionNames)} is not marked ${lower(note.label)} by the bakery`;
}
