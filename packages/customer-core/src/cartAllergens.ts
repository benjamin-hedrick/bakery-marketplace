// The words and rules of allergens in the cart and at checkout (WI-CUST-008). Pure, so they are unit tested. As everywhere else the wording says only what the
// bakery has listed and what the customer listed: it never says an item is safe, free of an allergen or a match.

import { markFor, type ConflictView, type Mark } from './conflictText.ts';
import { lower } from './text.ts';

export interface ListingAllergens {
  /** Allergen ids on the item itself. */
  item: readonly string[];
  /** Allergen ids by option id. */
  options: ReadonlyMap<string, readonly string[]>;
}

const label = (id: string, labels: ReadonlyMap<string, string>) => lower(labels.get(id) ?? id);

/**
 * Allergen ids as the registry's labels in a sentence ("gluten (wheat, rye, barley), milk (dairy), tree nuts"). An id the registry did not give a label for is
 * shown as itself, never dropped. Used wherever a customer reads what an item contains, so a listing says "tree nuts" and not "tree-nut".
 */
export const allergenNames = (ids: readonly string[], labels: ReadonlyMap<string, string>) =>
  ids.map((id) => label(id, labels)).join(', ');

/**
 * What a cart line says about allergens: the item's own, then each chosen option's. A line the bakery flagged nothing on says exactly that, so the cart
 * is never silent about it, and never claims more.
 */
export function lineAllergenSentences(
  listing: ListingAllergens | undefined,
  chosen: readonly { id: string; name: string }[],
  labels: ReadonlyMap<string, string>,
): string[] {
  if (!listing) return [];
  const sentences: string[] = [];
  if (listing.item.length > 0) sentences.push(`Contains ${allergenNames(listing.item, labels)}`);
  for (const option of chosen) {
    const ids = listing.options.get(option.id) ?? [];
    if (ids.length > 0) sentences.push(`${option.name} contains ${allergenNames(ids, labels)}`);
  }
  return sentences.length > 0 ? sentences : ['No allergens flagged by the bakery'];
}

/** A conflict on a cart line, worded with the line's name ("Almond Croissant contains tree nuts, which you listed as an allergy"). */
export function lineConflictText(
  lineName: string,
  conflict: ConflictView,
  labels: ReadonlyMap<string, string>,
  optionNames: ReadonlyMap<string, string>,
): Mark & { line: string } {
  const mark = markFor(conflict, labels, optionNames);
  // An option conflict already names the option; an item conflict starts with "Contains", which becomes "<line> contains".
  const line = conflict.source === 'OPTION' ? `${lineName}: ${mark.text}` : `${lineName} ${lower(mark.text)}`;
  return { ...mark, line };
}

/** A key that changes exactly when the set of serious conflicts does, so a tick given for one set of conflicts is not carried to another. */
export function allergyConflictKey(conflicts: readonly { lineIndex: number; conflict: ConflictView }[]): string {
  return JSON.stringify(
    conflicts
      .filter((c) => c.conflict.severity !== 'AVOID')
      .map((c) => [c.lineIndex, c.conflict.allergenId, c.conflict.source, [...c.conflict.optionIds].sort()])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

/** Whether there is any serious conflict (an unknown severity counts as serious, as in the marks). */
export const needsAcknowledgement = (conflicts: readonly { conflict: ConflictView }[]) =>
  conflicts.some((c) => c.conflict.severity !== 'AVOID');

/** The customer's allergies they have not unticked, in the registry's order: what "tell the bakery" will send. The `avoid` list never takes part. */
export function allergensToTell(allergies: readonly string[], unticked: ReadonlySet<string>): string[] {
  return allergies.filter((id) => !unticked.has(id));
}
