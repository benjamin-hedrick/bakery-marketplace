// Turning what the BFF answers about a customer's allergen profile and about a cart into the shapes the checkout screens use (WI-CUST-008 on the web,
// WI-MOB-002 in the app). Pure, so both clients read the answers the same way and the rules are unit tested once.

import type { ConflictView } from './conflictText.ts';

/** One part of what the checkout knows: not yet read, could not be read, or read. A failure of one part never hides another. */
export type Part<T> = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; value: T };

/** The customer's saved profile (`preferences`). Only the allergy lists matter to the allergen warning. */
export interface Profile {
  allergies: readonly string[];
  avoid: readonly string[];
  prefer: readonly string[];
}

/**
 * The profile to check against, or null when the customer has saved nothing (all three lists empty): there is then nothing to check, which the screens say
 * plainly and never present as "no conflicts".
 */
export function profileFromPreferences(
  p: { allergies: readonly string[]; avoid: readonly string[]; prefer: readonly string[] } | null | undefined,
): Profile | null {
  if (!p) return null;
  if (p.allergies.length === 0 && p.avoid.length === 0 && p.prefer.length === 0) return null;
  return { allergies: p.allergies, avoid: p.avoid, prefer: p.prefer };
}

/** A conflict and the cart line (by position) it belongs to. */
export interface LineConflict {
  lineIndex: number;
  conflict: ConflictView;
}

/** What `cartCheck` answered, as one list of conflicts. It answers line by line, in the order asked, so the position in the answer is the line. */
export function lineConflictsFromCheck(found: readonly { conflicts: readonly ConflictView[] }[]): LineConflict[] {
  return found.flatMap((line, lineIndex) => line.conflicts.map((conflict) => ({ lineIndex, conflict })));
}

/** The lines `cartCheck` is asked about: the listing's global id and the raw ids of the options chosen, in cart order. */
export function cartCheckLines(
  lines: readonly { listingId: string; modifiers: readonly { id: string }[] }[],
): { listingId: string; optionIds: string[] }[] {
  return lines.map((l) => ({ listingId: l.listingId, optionIds: l.modifiers.map((m) => m.id) }));
}
