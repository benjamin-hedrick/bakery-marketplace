import type { Mark } from '../lib/conflictText';

/**
 * The marks on a listing or an option: an icon and words for the severity, never colour alone (ADR-0022). Rendered inside the element that names the
 * listing, so the text is part of its accessible name. The icon is decoration; the heading carries the meaning.
 */
export function ConflictMarks({ marks }: { marks: readonly Mark[] }) {
  if (marks.length === 0) return null;
  return (
    <span className="conflict-marks">
      {marks.map((mark) => (
        <span
          key={`${mark.allergenId}:${mark.optionIds.join(',')}`}
          className={`conflict conflict-${mark.severity.toLowerCase()}`}
          data-testid="conflict"
          data-severity={mark.severity}
        >
          <span aria-hidden="true">{mark.severity === 'ALLERGY' ? '⚠ ' : 'ℹ '}</span>
          <strong>{mark.heading}:</strong> {mark.text}.{' '}
        </span>
      ))}
    </span>
  );
}
