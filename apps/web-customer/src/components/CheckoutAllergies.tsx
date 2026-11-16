import { dietCartText, lineConflictText, type Cart, type LineConflict, type Profile } from '@bakery/customer-core';
import type { CheckoutAllergens, LineDiet } from './useCheckoutAllergens';

/**
 * The customer's allergies against this order (WI-CUST-008): the conflicts the catalog found, notes on preferred diets (WI-TAG-004), the
 * acknowledgement a serious conflict asks for, and which allergies to tell the bakery. Advice only: the services decide what an order may contain.
 */
export function CheckoutAllergies({
  cart,
  info,
  profile,
  checkFailed,
  lineConflicts,
  lineDiets,
  mustAcknowledge,
  acknowledged,
  onAcknowledge,
  unticked,
  onTell,
}: {
  cart: Cart;
  info: CheckoutAllergens;
  profile: Profile | null;
  checkFailed: boolean;
  lineConflicts: readonly LineConflict[];
  lineDiets: readonly LineDiet[];
  mustAcknowledge: boolean;
  acknowledged: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
  /** The customer's allergies they chose not to tell the bakery. */
  unticked: ReadonlySet<string>;
  onTell: (allergenId: string, tell: boolean) => void;
}) {
  if (!profile && !checkFailed) return null;
  return (
    <section aria-label="Your allergies" data-testid="allergy-section">
      {checkFailed ? (
        <p role="alert" data-testid="check-failed">
          We could not check this order against your allergies. You can still place it; please check the allergens
          listed above with the bakery.
        </p>
      ) : null}
      {profile && info.check.state === 'ready' ? (
        <>
          {lineConflicts.length > 0 ? (
            <ul data-testid="conflicts" className="conflicts">
              {lineConflicts.map(({ lineIndex, conflict }) => {
                const line = cart.lines[lineIndex];
                if (!line) return null;
                const m = lineConflictText(
                  line.name,
                  conflict,
                  info.labels,
                  new Map(line.modifiers.map((o) => [o.id, o.name])),
                );
                return (
                  <li
                    key={`${lineIndex}:${conflict.allergenId}:${conflict.source}`}
                    data-testid="conflict"
                    data-severity={m.severity}
                  >
                    <span aria-hidden="true">{m.severity === 'ALLERGY' ? '⚠ ' : 'ℹ '}</span>
                    <strong>{m.heading}:</strong> {m.line}.
                  </li>
                );
              })}
            </ul>
          ) : null}
          {/* The diets the customer prefers (WI-TAG-004): the bakery's claim, a quiet note, never a reason to block. */}
          {lineDiets.some((d) => !d.marked) ? (
            <ul data-testid="diet-notes" className="diet-notes">
              {lineDiets.map((d) => {
                const line = cart.lines[d.lineIndex];
                if (!line) return null;
                const names = new Map(line.modifiers.map((o) => [o.id, o.name]));
                const text = dietCartText(line.name, {
                  tagId: d.tagId,
                  label: info.labels.get(d.tagId) ?? d.tagId,
                  marked: d.marked,
                  itemMarked: d.itemMarked,
                  optionNames: d.optionIdsNotMarked.map((id) => names.get(id) ?? 'An option'),
                });
                return text ? (
                  <li key={`${d.lineIndex}:${d.tagId}`} className="diet-note" data-testid="diet-note">
                    {text}.
                  </li>
                ) : null;
              })}
            </ul>
          ) : null}
          <p data-testid="personal-reminder">
            Marked from what the bakery has listed. An item without a mark is not guaranteed free of your allergens, so
            check with the bakery when it matters.
          </p>
          {mustAcknowledge ? (
            <p>
              <label>
                <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} /> I
                have read this and still want to order
              </label>
            </p>
          ) : null}
        </>
      ) : null}
      {profile && profile.allergies.length > 0 ? (
        <fieldset data-testid="tell-bakery">
          <legend>Tell the bakery</legend>
          <p>The bakery will see these allergies with your order.</p>
          {profile.allergies.map((id) => (
            <label key={id}>
              <input type="checkbox" checked={!unticked.has(id)} onChange={(e) => onTell(id, e.target.checked)} />{' '}
              {info.labels.get(id) ?? id}{' '}
            </label>
          ))}
        </fieldset>
      ) : null}
    </section>
  );
}
