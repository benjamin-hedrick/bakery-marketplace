export interface TagView {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
}

/**
 * The tags of a listing or an option as small chips (WI-TAG-002, ADR-0022). They describe; they are never styled like an allergen warning (no warning icon,
 * no strong weight). A diet tag is the bakery's own claim, so its accessible text says so ("Vegan, marked by the bakery"); with `full` the detail page shows
 * that wording on screen too. Which tags show is the catalog's decision (only public tags inside their window arrive here), so nothing is filtered by date here.
 */
export function TagChips({
  tags,
  full = false,
  inline = false,
  label = 'Tags',
}: {
  tags: readonly TagView[];
  full?: boolean;
  /** Inside a label or a sentence, where a list element is not allowed: the same chips as spans with list roles. */
  inline?: boolean;
  label?: string;
}) {
  if (tags.length === 0) return null;
  const List = inline ? 'span' : 'ul';
  const Item = inline ? 'span' : 'li';
  return (
    <List className="tag-chips" aria-label={label} data-testid="tags" {...(inline ? { role: 'list' } : {})}>
      {tags.map((tag) => (
        <Item
          key={tag.id}
          className="tag-chip"
          data-testid="tag"
          data-kind={tag.kind}
          {...(inline ? { role: 'listitem' } : {})}
        >
          {tag.label}
          {tag.kind === 'DIET' ? (
            <span className={full ? 'claim' : 'sr-only'}>
              {full ? ' (marked by the bakery)' : ', marked by the bakery'}
            </span>
          ) : null}
        </Item>
      ))}
    </List>
  );
}
