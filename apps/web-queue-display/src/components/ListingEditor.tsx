import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { graphql } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { ListingEditorQuery } from '../__generated__/ListingEditorQuery.graphql';
import type { ListingEditorTagsQuery } from '../__generated__/ListingEditorTagsQuery.graphql';
import { getBrowserEnvironment, GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';
import {
  emptyForm,
  formFromListing,
  groupProblems,
  LISTING_TEXT,
  newCreateKey,
  newOptionId,
  toInput,
  type ListingForm,
  type ListingInput,
  type LoadedListing,
  type OptionForm,
} from '../lib/listings';
import { readListing } from './ListingFields';
import { createListing, updateListing, type WriteOutcome } from './ListingWrites';
import { StockControls } from './StockControls';

// Create and edit a listing (WI-CAT-008 requirements 4 to 8). The form sends what the vendor typed and the catalog decides; its refusals appear beside
// their fields and in a summary, and the form keeps what was typed. An edit names the edit version it was loaded at, so a save from an old copy is
// refused instead of undoing a newer edit; a listing that stays counted is sent without a count. A create sends one idempotency key, made when the
// page opens, with every attempt, so a retry or a second click cannot make a second listing.

const listingQuery = graphql`
  query ListingEditorQuery($id: ID!) {
    myListing(id: $id) {
      ...ListingFields_listing
    }
  }
`;

// The registry is public and leaves out hidden tags and tags outside their window: only these are offered, and any other tag a listing carries is kept.
const tagsQuery = graphql`
  query ListingEditorTagsQuery {
    tags {
      id
      kind
      label
    }
  }
`;

interface Tag {
  id: string;
  label: string;
}
type Load = 'loading' | 'ready' | 'notfound' | 'failed' | 'ended' | 'forbidden';
interface Notice {
  text: string;
  /** CHANGED: offer to load the newer copy. */
  changed?: boolean;
  /** A success ("Saved."): announced politely and not styled as a problem. */
  ok?: boolean;
  /** KEY_REUSED: the listing the create made, when it could be found. */
  createdId?: string | null;
}

const errorId = (element: string) => `${element}-error`;

/** The ids of an element's hint and error, for aria-describedby. */
const describedBy = (element: string, problems: Record<string, string[]>, hint?: string) =>
  [hint, problems[element] ? errorId(element) : undefined].filter(Boolean).join(' ') || undefined;

function FieldError({ element, problems }: { element: string; problems: Record<string, string[]> }) {
  const messages = problems[element];
  if (!messages) return null;
  return (
    <p className="field-error" id={errorId(element)} data-testid={`error-${element}`}>
      {messages.join(' ')}
    </p>
  );
}

function Checkboxes(props: {
  id: string;
  legend: string;
  offered: readonly Tag[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  problems: Record<string, string[]>;
  hint?: ReactNode;
}) {
  const { id, legend, offered, values, onChange, problems, hint } = props;
  // A value the listing has that is not offered (an old allergen value) is shown checked, so the vendor can see it and take it off.
  // With no list at all (the registry could not be read) the values are only shown, not judged.
  const suffix = offered.length > 0 ? ' (not on the list)' : '';
  const shown = [
    ...offered,
    ...values.filter((v) => !offered.some((o) => o.id === v)).map((v) => ({ id: v, label: `${v}${suffix}` })),
  ];
  return (
    <fieldset
      id={id}
      className="checkboxes"
      aria-describedby={describedBy(id, problems, hint ? `${id}-hint` : undefined)}
    >
      <legend>{legend}</legend>
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {shown.map((t) => (
        <label key={t.id}>
          <input
            type="checkbox"
            checked={values.includes(t.id)}
            onChange={(e) => onChange(e.target.checked ? [...values, t.id] : values.filter((v) => v !== t.id))}
          />{' '}
          {t.label}
        </label>
      ))}
      <FieldError element={id} problems={problems} />
    </fieldset>
  );
}

export function ListingEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const isEdit = id !== null;
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [loaded, setLoaded] = useState<LoadedListing | null>(null);
  const [load, setLoad] = useState<Load>(isEdit ? 'loading' : 'ready');
  const [allergens, setAllergens] = useState<Tag[]>([]);
  const [otherTags, setOtherTags] = useState<Tag[]>([]);
  const [registryFailed, setRegistryFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problems, setProblems] = useState<{ byElement: Record<string, string[]>; summary: string[] }>({
    byElement: {},
    summary: [],
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [stockMessage, setStockMessage] = useState('');
  // One key for this create page (requirement 6): every attempt of this create sends it. A new key comes only with a new, empty page.
  const [createKey] = useState(() => newCreateKey());
  const sentWithKey = useRef<string[]>([]);
  const alertRef = useRef<HTMLDivElement>(null);

  // The listing as the catalog holds it now (null: missing or another vendor's). Pure: the state is set by the callbacks below, after the answer.
  const fetchListing = useCallback(
    (): Promise<LoadedListing | null> =>
      id === null
        ? Promise.resolve(null)
        : fetchQuery<ListingEditorQuery>(getBrowserEnvironment(), listingQuery, { id }, { fetchPolicy: 'network-only' })
            .toPromise()
            .then((data) => (data?.myListing ? readListing(data.myListing) : null)),
    [id],
  );
  const showLoaded = useCallback((listing: LoadedListing | null) => {
    if (!listing) return setLoad('notfound');
    setLoaded(listing);
    setForm(formFromListing(listing));
    setLoad('ready');
  }, []);
  const showLoadFailure = useCallback((e: unknown) => {
    if (e instanceof UnauthenticatedError) setLoad('ended');
    else if (e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN')) setLoad('forbidden');
    else setLoad('failed');
  }, []);
  const loadListing = () => fetchListing().then(showLoaded, showLoadFailure);

  useEffect(() => {
    if (id === null) return;
    fetchListing().then(showLoaded, showLoadFailure);
  }, [id, fetchListing, showLoaded, showLoadFailure]);

  useEffect(() => {
    fetchQuery<ListingEditorTagsQuery>(getBrowserEnvironment(), tagsQuery, {})
      .toPromise()
      .then((data) => {
        const tags = data?.tags ?? [];
        setAllergens(tags.filter((t) => t.kind === 'ALLERGEN').map((t) => ({ id: t.id, label: t.label })));
        setOtherTags(tags.filter((t) => t.kind !== 'ALLERGEN').map((t) => ({ id: t.id, label: t.label })));
      })
      .catch(() => setRegistryFailed(true));
  }, []);

  useEffect(() => {
    if (notice || problems.summary.length > 0) alertRef.current?.focus();
  }, [notice, problems]);

  const set = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setOption = (index: number, change: Partial<OptionForm>) =>
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? { ...o, ...change } : o)) }));

  const showProblems = (fields: readonly { field: string; message: string }[]) => {
    const grouped = groupProblems(fields);
    setProblems({ byElement: grouped.byElement, summary: fields.map((f) => f.message) });
  };

  /** After a refused create because the key was used for other content: the listing was made by an earlier attempt of this page. Find it by repeating that attempt. */
  const findCreated = async (): Promise<string | null> => {
    for (const earlier of sentWithKey.current.slice(0, -1)) {
      const again = await createListing(JSON.parse(earlier) as ListingInput, createKey);
      if (again.kind === 'saved') return again.listing.id;
    }
    return null;
  };

  const loadedCounted =
    loaded !== null && loaded.stock.availableQuantity !== null && loaded.stock.availableQuantity !== undefined;

  const handle = async (outcome: WriteOutcome) => {
    if (outcome.kind === 'saved') {
      if (!isEdit) {
        await router.push(`/listings/${encodeURIComponent(outcome.listing.id)}?created=1`);
        return;
      }
      setLoaded(outcome.listing);
      setForm(formFromListing(outcome.listing));
      setNotice({ text: 'Saved.', ok: true });
      return;
    }
    if (outcome.kind === 'login-ended') return setNotice({ text: LISTING_TEXT.LOGIN_ENDED });
    if (outcome.kind === 'forbidden') return setLoad('forbidden');
    if (outcome.kind === 'failed') return setNotice({ text: LISTING_TEXT.FAILED });
    switch (outcome.code) {
      case 'INVALID':
        showProblems(outcome.fields);
        return setNotice({ text: LISTING_TEXT.INVALID });
      case 'CHANGED':
        return setNotice({ text: LISTING_TEXT.CHANGED, changed: true });
      case 'KEY_REUSED':
        return setNotice({ text: LISTING_TEXT.KEY_REUSED, createdId: await findCreated() });
      case 'VENDOR_NOT_VERIFIED':
      case 'NOT_FOUND':
        return setNotice({ text: LISTING_TEXT[outcome.code] });
      default:
        return setNotice({ text: LISTING_TEXT.FAILED });
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setNotice(null);
    setProblems({ byElement: {}, summary: [] });
    const built = toInput(form, isEdit ? loadedCounted : null);
    if ('problems' in built) {
      showProblems(Object.entries(built.problems).map(([field, message]) => ({ field, message })));
      return setNotice({ text: LISTING_TEXT.INVALID });
    }
    setSubmitting(true);
    let outcome: WriteOutcome;
    if (isEdit && loaded) {
      outcome = await updateListing(loaded.id, built.input, loaded.editVersion);
    } else {
      const sent = JSON.stringify(built.input);
      sentWithKey.current = [...sentWithKey.current.filter((s) => s !== sent), sent];
      outcome = await createListing(built.input, createKey);
    }
    setSubmitting(false);
    await handle(outcome);
  };

  if (load === 'loading')
    return (
      <main className="listing-editor">
        <p data-testid="editor-loading">Loading the listing…</p>
      </main>
    );
  if (load === 'notfound')
    return (
      <main className="listing-editor">
        <p role="alert" data-testid="editor-not-found">
          {LISTING_TEXT.NOT_FOUND}
        </p>
        <Link href="/listings">Back to your listings</Link>
      </main>
    );
  if (load === 'ended')
    return (
      <main className="listing-editor">
        <p role="alert" data-testid="editor-login-ended">
          {LISTING_TEXT.LOGIN_ENDED}
        </p>
      </main>
    );
  if (load === 'forbidden')
    return (
      <main className="listing-editor">
        <p role="alert" data-testid="editor-forbidden">
          {LISTING_TEXT.FORBIDDEN}
        </p>
      </main>
    );
  if (load === 'failed')
    return (
      <main className="listing-editor">
        <div role="alert" data-testid="editor-failed">
          <p>The listing could not be loaded. {LISTING_TEXT.FAILED}</p>
          <button
            type="button"
            onClick={() => {
              setLoad('loading');
              void loadListing();
            }}
          >
            Try again
          </button>
        </div>
      </main>
    );

  const p = problems.byElement;
  const keptTags = loaded
    ? loaded.tags.filter((t) => form.tags.includes(t.id) && !otherTags.some((o) => o.id === t.id))
    : [];
  const created = router.query['created'] === '1';

  return (
    <main className="listing-editor" aria-labelledby="editor-title">
      <p>
        <Link href="/listings">Back to your listings</Link>
      </p>
      <h1 id="editor-title">{isEdit ? `Edit ${loaded?.name ?? 'listing'}` : 'Add a listing'}</h1>
      {created && !notice ? (
        <p role="status" data-testid="editor-created">
          The listing was created.
        </p>
      ) : null}
      <div ref={alertRef} tabIndex={-1} className="editor-alerts">
        {notice ? (
          <div
            role={notice.ok ? 'status' : 'alert'}
            className={notice.ok ? 'notice ok' : 'notice'}
            data-testid="editor-notice"
          >
            <p>{notice.text}</p>
            {notice.changed ? (
              <button type="button" onClick={() => void loadListing().then(() => setNotice(null))}>
                Load the newer copy (your changes here will be replaced)
              </button>
            ) : null}
            {notice.createdId !== undefined ? (
              notice.createdId ? (
                <Link href={`/listings/${encodeURIComponent(notice.createdId)}`}>
                  Open the listing that was created
                </Link>
              ) : (
                <Link href="/listings">Find it in your listings</Link>
              )
            ) : null}
          </div>
        ) : null}
        {problems.summary.length > 0 ? (
          <div className="error-summary" data-testid="error-summary">
            <h2>Please correct these:</h2>
            <ul>
              {problems.summary.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {registryFailed ? (
        <p role="alert" data-testid="registry-failed">
          The list of allergens and tags could not be loaded. The ones this listing has are kept; reload the page to
          change them.
        </p>
      ) : null}

      <form onSubmit={(e) => void save(e)} noValidate>
        <fieldset disabled={submitting} className="editor-fields">
          <legend className="visually-hidden">The listing</legend>
          <label htmlFor="listing-name">Name</label>
          <input
            id="listing-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={p['listing-name'] ? true : undefined}
            aria-describedby={describedBy('listing-name', p)}
          />
          <FieldError element="listing-name" problems={p} />

          <label htmlFor="listing-description">Description (optional)</label>
          <textarea
            id="listing-description"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            aria-invalid={p['listing-description'] ? true : undefined}
            aria-describedby={describedBy('listing-description', p)}
          />
          <FieldError element="listing-description" problems={p} />

          <label htmlFor="listing-category">Category</label>
          <input
            id="listing-category"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            aria-invalid={p['listing-category'] ? true : undefined}
            aria-describedby={describedBy('listing-category', p)}
          />
          <FieldError element="listing-category" problems={p} />

          <label htmlFor="listing-price">Price</label>
          <p className="hint" id="listing-price-hint">
            In dollars and cents, for example 4.50 (up to 100000.00).
          </p>
          <input
            id="listing-price"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            aria-invalid={p['listing-price'] ? true : undefined}
            aria-describedby={describedBy('listing-price', p, 'listing-price-hint')}
          />
          <FieldError element="listing-price" problems={p} />

          <Checkboxes
            id="listing-allergens"
            legend="Allergens"
            offered={allergens}
            values={form.allergens}
            onChange={(v) => set('allergens', v)}
            problems={p}
            hint="Tick every allergen the item contains. Customers see these as warnings."
          />

          <Checkboxes
            id="listing-tags"
            legend="Other tags"
            offered={otherTags}
            values={form.tags.filter((t) => otherTags.some((o) => o.id === t))}
            onChange={(v) => set('tags', [...v, ...keptTags.map((t) => t.id)])}
            problems={p}
          />
          {keptTags.length > 0 ? (
            <p className="hint" data-testid="kept-tags">
              Also on this listing, kept as they are: {keptTags.map((t) => t.label).join(', ')}.
            </p>
          ) : null}

          <fieldset id="listing-options" className="options" aria-describedby={describedBy('listing-options', p)}>
            <legend>Options</legend>
            {form.options.length === 0 ? <p className="hint">No options. Customers order the item as it is.</p> : null}
            {form.options.map((o, i) => (
              <fieldset key={o.key} className="option" data-testid="option">
                <legend>Option {i + 1}</legend>
                <label htmlFor={`option-${i}-name`}>Option name</label>
                <input
                  id={`option-${i}-name`}
                  value={o.name}
                  onChange={(e) => setOption(i, { name: e.target.value })}
                  aria-invalid={p[`option-${i}-name`] ? true : undefined}
                  aria-describedby={describedBy(`option-${i}-name`, p)}
                />
                <FieldError element={`option-${i}-name`} problems={p} />
                <label htmlFor={`option-${i}-price`}>Price difference</label>
                <input
                  id={`option-${i}-price`}
                  inputMode="decimal"
                  value={o.price}
                  onChange={(e) => setOption(i, { price: e.target.value })}
                  aria-invalid={p[`option-${i}-price`] ? true : undefined}
                  aria-describedby={describedBy(`option-${i}-price`, p)}
                />
                <FieldError element={`option-${i}-price`} problems={p} />
                <Checkboxes
                  id={`option-${i}-allergens`}
                  legend={`Allergens of option ${i + 1}`}
                  offered={allergens}
                  values={o.allergens}
                  onChange={(v) => setOption(i, { allergens: v })}
                  problems={p}
                />
                <Checkboxes
                  id={`option-${i}-tags`}
                  legend={`Tags of option ${i + 1}`}
                  offered={otherTags}
                  values={o.tags.filter((t) => otherTags.some((x) => x.id === t))}
                  onChange={(v) =>
                    setOption(i, { tags: [...v, ...o.tags.filter((t) => !otherTags.some((x) => x.id === t))] })
                  }
                  problems={p}
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'options',
                      form.options.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={`Remove option ${o.name || i + 1}`}
                >
                  Remove option
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() => {
                const optionId = newOptionId();
                set('options', [
                  ...form.options,
                  { key: optionId, id: optionId, name: '', price: '', allergens: [], tags: [] },
                ]);
              }}
            >
              Add an option
            </button>
            <FieldError element="listing-options" problems={p} />
          </fieldset>

          <fieldset id="listing-mode" className="stock" aria-describedby={describedBy('listing-mode', p)}>
            <legend>Stock</legend>
            <label>
              <input
                type="radio"
                name="listing-mode"
                checked={form.mode === 'MADE_TO_ORDER'}
                onChange={() => set('mode', 'MADE_TO_ORDER')}
              />{' '}
              Made to order (no count)
            </label>
            <label>
              <input
                type="radio"
                name="listing-mode"
                checked={form.mode === 'COUNTED'}
                onChange={() => set('mode', 'COUNTED')}
              />{' '}
              Counted (each order takes from a count)
            </label>
            <FieldError element="listing-mode" problems={p} />
            {form.mode === 'COUNTED' && loadedCounted && loaded ? (
              <div className="count-now" data-testid="count-now">
                <p>
                  Count now: <strong>{loaded.stock.availableQuantity}</strong>. Change it here, not with a number in the
                  form, so a sale is never undone.
                </p>
                <StockControls
                  listing={loaded}
                  // Only the stock: the edit version stays the one the form was loaded at, so a save never overwrites an edit made elsewhere.
                  onChanged={(l) => setLoaded((current) => (current ? { ...current, stock: l.stock } : current))}
                  onMessage={setStockMessage}
                  disabled={submitting}
                />
                {stockMessage ? (
                  <p role="status" data-testid="stock-message">
                    {stockMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
            {form.mode === 'COUNTED' && !loadedCounted ? (
              <>
                <label htmlFor="listing-starting-quantity">Starting count</label>
                <input
                  id="listing-starting-quantity"
                  inputMode="numeric"
                  value={form.startingQuantity}
                  onChange={(e) => set('startingQuantity', e.target.value)}
                  aria-invalid={p['listing-starting-quantity'] ? true : undefined}
                  aria-describedby={describedBy('listing-starting-quantity', p)}
                />
                <FieldError element="listing-starting-quantity" problems={p} />
              </>
            ) : null}
            {isEdit && form.mode === 'MADE_TO_ORDER' && loadedCounted ? (
              <p className="hint" data-testid="drops-count">
                Saving as made to order drops the count.
              </p>
            ) : null}
            <label htmlFor="listing-max-per-order">Most per order (optional)</label>
            <input
              id="listing-max-per-order"
              inputMode="numeric"
              value={form.maxPerOrder}
              onChange={(e) => set('maxPerOrder', e.target.value)}
              aria-invalid={p['listing-max-per-order'] ? true : undefined}
              aria-describedby={describedBy('listing-max-per-order', p)}
            />
            <FieldError element="listing-max-per-order" problems={p} />
            {form.mode === 'COUNTED' ? (
              <>
                <label htmlFor="listing-threshold">Show as low at this count or below (optional)</label>
                <input
                  id="listing-threshold"
                  inputMode="numeric"
                  value={form.lowStockThreshold}
                  onChange={(e) => set('lowStockThreshold', e.target.value)}
                  aria-invalid={p['listing-threshold'] ? true : undefined}
                  aria-describedby={describedBy('listing-threshold', p)}
                />
                <FieldError element="listing-threshold" problems={p} />
              </>
            ) : null}
          </fieldset>

          <fieldset id="listing-status" aria-describedby={describedBy('listing-status', p)}>
            <legend>On the menu</legend>
            <label>
              <input
                type="radio"
                name="listing-status"
                checked={form.status === 'DRAFT'}
                onChange={() => set('status', 'DRAFT')}
              />{' '}
              Draft (only you see it)
            </label>
            <label>
              <input
                type="radio"
                name="listing-status"
                checked={form.status === 'PUBLISHED'}
                onChange={() => set('status', 'PUBLISHED')}
              />{' '}
              Published (customers see it)
            </label>
            <FieldError element="listing-status" problems={p} />
          </fieldset>

          <button type="submit" className="primary" data-testid="save-listing">
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create listing'}
          </button>
        </fieldset>
      </form>
    </main>
  );
}
