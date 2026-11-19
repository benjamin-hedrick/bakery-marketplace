import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { graphql } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { ListingsListQuery, MyListingFilter } from '../__generated__/ListingsListQuery.graphql';
import { getBrowserEnvironment, GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';
import { formatCents, formFromListing, LISTING_TEXT, stockText, toInput, type LoadedListing } from '../lib/listings';
import { readListing } from './ListingFields';
import { updateListing } from './ListingWrites';
import { StockControls } from './StockControls';

// The vendor's own listings (WI-CAT-008 requirements 2, 3 and 7): each with its price, Draft or Published, its stock and when it last changed; filtered
// by status and paged. The counts are changed here by adjustments only, and publishing saves only the status, with the edit version it was read at.

const listQuery = graphql`
  query ListingsListQuery($status: MyListingFilter, $after: String) {
    myListings(status: $status, first: 20, after: $after) {
      edges {
        node {
          ...ListingFields_listing
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type Filter = 'ALL' | MyListingFilter;
type Load = 'loading' | 'ready' | 'failed' | 'ended' | 'forbidden';

const changedAt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
];

export function ListingsList() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [items, setItems] = useState<LoadedListing[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [rowMessages, setRowMessages] = useState<ReadonlyMap<string, string>>(new Map());
  const [announcement, setAnnouncement] = useState('');

  // One page of listings. Pure: the state is set by the callbacks below, after the answer (the loading state by whoever asks: the filter, Try again).
  const readPage = (status: Filter, after: string | null) =>
    fetchQuery<ListingsListQuery>(
      getBrowserEnvironment(),
      listQuery,
      { status: status === 'ALL' ? null : status, after },
      { fetchPolicy: 'network-only' },
    )
      .toPromise()
      .then((data) => ({
        page: (data?.myListings.edges ?? []).map((e) => readListing(e.node)),
        next: data?.myListings.pageInfo.hasNextPage ? (data.myListings.pageInfo.endCursor ?? null) : null,
      }));
  const showPage = useCallback(
    (append: boolean) => (result: { page: LoadedListing[]; next: string | null }) => {
      setItems((current) => (append ? [...current, ...result.page] : result.page));
      setNext(result.next);
      setLoad('ready');
    },
    [],
  );
  const showFailure = useCallback((e: unknown) => {
    if (e instanceof UnauthenticatedError) setLoad('ended');
    else if (e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN')) setLoad('forbidden');
    else setLoad('failed');
  }, []);
  const fetchPage = (status: Filter, after: string | null, append: boolean) =>
    readPage(status, after).then(showPage(append), showFailure);

  useEffect(() => {
    readPage(filter, null).then(showPage(false), showFailure);
  }, [filter, showPage, showFailure]);

  const replace = (listing: LoadedListing) =>
    setItems((current) => current.map((l) => (l.id === listing.id ? listing : l)));
  const say = (id: string, text: string) => {
    setRowMessages((current) => new Map(current).set(id, text));
    setAnnouncement(text);
  };

  /** Publish or unpublish: the listing as it was read, with the other status and its edit version; the stock settings are left as they are. */
  const setStatus = async (listing: LoadedListing, status: 'DRAFT' | 'PUBLISHED') => {
    const built = toInput(
      formFromListing(listing),
      listing.stock.availableQuantity !== null && listing.stock.availableQuantity !== undefined,
    );
    if (!('input' in built)) return say(listing.id, `${listing.name}: ${LISTING_TEXT.FAILED}`);
    setBusyIds((current) => new Set(current).add(listing.id));
    const outcome = await updateListing(listing.id, { ...built.input, status, stock: null }, listing.editVersion);
    setBusyIds((current) => {
      const copy = new Set(current);
      copy.delete(listing.id);
      return copy;
    });
    if (outcome.kind === 'saved') {
      replace(outcome.listing);
      return say(listing.id, `${listing.name} is ${status === 'PUBLISHED' ? 'published' : 'a draft'}.`);
    }
    if (outcome.kind === 'rejected') {
      if (outcome.code === 'CHANGED') {
        say(listing.id, `${listing.name}: ${LISTING_TEXT.CHANGED} The list has been reloaded.`);
        return fetchPage(filter, null, false);
      }
      if (outcome.code === 'INVALID')
        return say(
          listing.id,
          `${listing.name}: ${outcome.fields.map((f) => f.message).join(' ') || LISTING_TEXT.INVALID}`,
        );
      return say(
        listing.id,
        `${listing.name}: ${LISTING_TEXT[outcome.code === 'KEY_REUSED' ? 'FAILED' : outcome.code]}`,
      );
    }
    if (outcome.kind === 'login-ended') return setLoad('ended');
    if (outcome.kind === 'forbidden') return setLoad('forbidden');
    say(listing.id, `${listing.name}: ${LISTING_TEXT.FAILED}`);
  };

  if (load === 'ended')
    return (
      <main className="listings">
        <p role="alert" data-testid="listings-login-ended">
          {LISTING_TEXT.LOGIN_ENDED}
        </p>
      </main>
    );
  if (load === 'forbidden')
    return (
      <main className="listings">
        <p role="alert" data-testid="listings-forbidden">
          {LISTING_TEXT.FORBIDDEN}
        </p>
      </main>
    );

  return (
    <main className="listings" aria-labelledby="listings-title">
      <div className="listings-head">
        <h1 id="listings-title">Your listings</h1>
        <Link href="/listings/new" className="button primary">
          Add a listing
        </Link>
      </div>
      <fieldset className="filters">
        <legend>Show</legend>
        {FILTERS.map((f) => (
          <label key={f.value}>
            <input
              type="radio"
              name="listing-filter"
              value={f.value}
              checked={filter === f.value}
              onChange={() => {
                setLoad('loading');
                setFilter(f.value);
              }}
            />{' '}
            {f.label}
          </label>
        ))}
      </fieldset>
      <div className="visually-hidden" role="status" aria-live="polite" data-testid="listings-announcement">
        {announcement}
      </div>
      {load === 'loading' ? <p data-testid="listings-loading">Loading your listings…</p> : null}
      {load === 'failed' ? (
        <div role="alert" data-testid="listings-failed">
          <p>Your listings could not be loaded. {LISTING_TEXT.FAILED}</p>
          <button
            type="button"
            onClick={() => {
              setLoad('loading');
              void fetchPage(filter, null, false);
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {load === 'ready' && items.length === 0 ? (
        <p data-testid="listings-empty">
          {filter === 'ALL' ? (
            <>
              You have no listings yet. <Link href="/listings/new">Add your first listing</Link> to put it on your menu.
            </>
          ) : filter === 'DRAFT' ? (
            'You have no drafts.'
          ) : (
            'You have no published listings.'
          )}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="listing-rows" data-testid="listing-rows">
          {items.map((l) => {
            const busy = busyIds.has(l.id);
            const published = l.status === 'PUBLISHED';
            return (
              <li key={l.id} className="listing-row" data-testid="listing-row" data-name={l.name}>
                <div className="listing-main">
                  <Link href={`/listings/${encodeURIComponent(l.id)}`} className="listing-name">
                    {l.name}
                  </Link>
                  <span data-testid="listing-price">{formatCents(l.price.cents)}</span>
                  <span className={published ? 'status published' : 'status draft'} data-testid="listing-status">
                    {published ? 'Published' : 'Draft'}
                  </span>
                  <span data-testid="listing-stock">{stockText(l.stock)}</span>
                  <span className="muted">Changed {changedAt.format(new Date(l.updatedAt))}</span>
                </div>
                <div className="listing-actions">
                  <StockControls
                    listing={l}
                    onChanged={replace}
                    onMessage={(text) => say(l.id, text)}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${published ? 'Unpublish' : 'Publish'} ${l.name}`}
                    onClick={() => void setStatus(l, published ? 'DRAFT' : 'PUBLISHED')}
                  >
                    {published ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
                {rowMessages.get(l.id) ? (
                  <p className="row-message" data-testid="row-message">
                    {rowMessages.get(l.id)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {load === 'ready' && next ? (
        <button type="button" onClick={() => void fetchPage(filter, next, true)} data-testid="listings-more">
          Show more
        </button>
      ) : null}
    </main>
  );
}
