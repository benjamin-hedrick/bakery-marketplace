// The words for a customer's own conflicts (WI-CUST-006, ADR-0022). Pure, so the wording rules can be tested without a browser. The wording never says
// an item is safe, free of an allergen or a "match": a listing with no conflict is simply not marked, and the page says what that does not mean.

export type Severity = 'ALLERGY' | 'AVOID' | '%future added value';
export type Source = 'ITEM' | 'OPTION' | '%future added value';

export interface ConflictView {
  allergenId: string;
  severity: Severity;
  source: Source;
  optionIds: readonly string[];
}

/** One mark on a listing: how serious it is, and the sentence that goes with it. */
export interface Mark {
  severity: 'ALLERGY' | 'AVOID';
  /** "Allergy warning" or "You avoid this": the words that carry the severity next to the icon, so colour is never the only signal. */
  heading: string;
  text: string;
  /** The allergen id and, for an option, the option ids, for keys and for matching a mark to an option row. */
  allergenId: string;
  optionIds: readonly string[];
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

const joinNames = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** The sentence for one conflict. `labels` maps allergen ids to the registry's labels, `optionNames` maps option ids to their names. */
export function markFor(
  conflict: ConflictView,
  labels: ReadonlyMap<string, string>,
  optionNames: ReadonlyMap<string, string>,
): Mark {
  // A severity this page does not know is shown as the stronger one rather than dropped: better a needless warning than a missing one.
  const severity = conflict.severity === 'AVOID' ? 'AVOID' : 'ALLERGY';
  const allergen = lower(labels.get(conflict.allergenId) ?? conflict.allergenId);
  const why = severity === 'ALLERGY' ? 'which you listed as an allergy' : 'which you avoid';
  const subject =
    conflict.source === 'OPTION'
      ? `${joinNames(conflict.optionIds.map((id) => optionNames.get(id) ?? 'An option'))} contains`
      : 'Contains';
  return {
    severity,
    heading: severity === 'ALLERGY' ? 'Allergy warning' : 'You avoid this',
    text: `${subject} ${allergen}, ${why}`,
    allergenId: conflict.allergenId,
    optionIds: conflict.optionIds,
  };
}

/** The marks of a listing, the serious ones first. */
export function marksFor(
  conflicts: readonly ConflictView[],
  labels: ReadonlyMap<string, string>,
  optionNames: ReadonlyMap<string, string>,
): Mark[] {
  return conflicts
    .map((c) => markFor(c, labels, optionNames))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'ALLERGY' ? -1 : 1));
}

/** Whether the listing itself carries one of the customer's allergens (what the hide toggle acts on); an option alone does not hide an item. */
export const hasItemConflict = (conflicts: readonly ConflictView[]) => conflicts.some((c) => c.source !== 'OPTION');
