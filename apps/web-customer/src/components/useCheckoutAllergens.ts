import { useEffect, useMemo, useState } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { useCheckoutAllergensCheckQuery } from '../__generated__/useCheckoutAllergensCheckQuery.graphql';
import type { useCheckoutAllergensListingQuery } from '../__generated__/useCheckoutAllergensListingQuery.graphql';
import type { useCheckoutAllergensProfileQuery } from '../__generated__/useCheckoutAllergensProfileQuery.graphql';
import type { useCheckoutAllergensTagsQuery } from '../__generated__/useCheckoutAllergensTagsQuery.graphql';
import type { Cart } from '../lib/cart/cart.ts';
import type { ConflictView } from '../lib/conflictText.ts';
import type { ListingAllergens } from '../lib/cartAllergens.ts';
import { GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';
import { useSession } from '../lib/session';

// WI-CUST-008: what the checkout knows about allergens, read fresh from the network every time the cart's contents change (a stored copy could be older than
// the bakery's last edit). Three separate answers, so one failing never hides another: the allergens of each item and chosen option (public, for everyone), the
// registry's labels (public), and, for a logged-in customer with a profile, their own conflicts (`cartCheck`).

const tagsQuery = graphql`
  query useCheckoutAllergensTagsQuery {
    tags(kind: ALLERGEN) {
      id
      label
    }
  }
`;

const listingQuery = graphql`
  query useCheckoutAllergensListingQuery($id: ID!) {
    listing(id: $id) {
      id
      allergenFlags
      modifiers {
        id
        allergens
      }
    }
  }
`;

const profileQuery = graphql`
  query useCheckoutAllergensProfileQuery {
    preferences {
      allergies
      avoid
    }
  }
`;

const checkQuery = graphql`
  query useCheckoutAllergensCheckQuery($lines: [CartLineInput!]!) {
    cartCheck(lines: $lines) {
      listingId
      found
      conflicts {
        allergenId
        severity
        source
        optionIds
      }
    }
  }
`;

export type Part<T> = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; value: T };

export interface LineConflict {
  lineIndex: number;
  conflict: ConflictView;
}

export interface Profile {
  allergies: readonly string[];
  avoid: readonly string[];
}

export interface CheckoutAllergens {
  /** The registry's labels for allergen ids. Empty until read or if it cannot be: the words then use the ids. */
  labels: ReadonlyMap<string, string>;
  /** Allergens of each listing in the cart (by listing id), for everyone. */
  listings: Part<ReadonlyMap<string, ListingAllergens>>;
  /**
   * The customer's profile. `none` for someone who is not logged in, is not a customer, or has not set anything: nothing to check. `failed` when a logged-in
   * customer's profile could not be read, which is not the same as having none.
   */
  profile: Part<Profile | null>;
  /** The conflicts of the cart's lines with the profile, when there is a profile to check against. */
  check: Part<readonly LineConflict[]> | { state: 'idle' };
}

const isForbidden = (e: unknown) => e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN');

export function useCheckoutAllergens(cart: Cart): CheckoutAllergens {
  const environment = useRelayEnvironment();
  const session = useSession();
  const loggedIn = session.status === 'user';

  const listingIds = useMemo(() => [...new Set(cart.lines.map((l) => l.listingId))].sort(), [cart.lines]);
  const listingKey = listingIds.join('|');
  const linesKey = cart.lines
    .map(
      (l) =>
        `${l.listingId}:${l.modifiers
          .map((m) => m.id)
          .sort()
          .join(',')}`,
    )
    .join('|');

  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const [listings, setListings] = useState<{ key: string; part: Part<ReadonlyMap<string, ListingAllergens>> }>({
    key: '',
    part: { state: 'loading' },
  });
  const [asked, setProfile] = useState<Part<Profile | null>>({ state: 'loading' });
  // Someone who is not logged in has no profile to read: that is "none" at once, not a wait.
  const profile: Part<Profile | null> = loggedIn ? asked : { state: 'ready', value: null };
  const [check, setCheck] = useState<{ key: string; part: CheckoutAllergens['check'] }>({
    key: '',
    part: { state: 'idle' },
  });

  useEffect(() => {
    let cancelled = false;
    fetchQuery<useCheckoutAllergensTagsQuery>(environment, tagsQuery, {}, { fetchPolicy: 'network-only' })
      .toPromise()
      .then((data) => {
        if (!cancelled) setLabels(new Map((data?.tags ?? []).map((t) => [t.id, t.label])));
      })
      .catch(() => {}); // the words then use the ids; nothing is hidden
    return () => {
      cancelled = true;
    };
  }, [environment]);

  useEffect(() => {
    if (listingIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      listingIds.map((id) =>
        fetchQuery<useCheckoutAllergensListingQuery>(
          environment,
          listingQuery,
          { id },
          { fetchPolicy: 'network-only' },
        ).toPromise(),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const byId = new Map<string, ListingAllergens>();
        results.forEach((data, i) => {
          if (!data?.listing) return; // no longer on offer: checkout itself will say so
          byId.set(listingIds[i]!, {
            item: data.listing.allergenFlags,
            options: new Map(data.listing.modifiers.map((m) => [m.id, m.allergens])),
          });
        });
        setListings({ key: listingKey, part: { state: 'ready', value: byId } });
      })
      .catch(() => {
        if (!cancelled) setListings({ key: listingKey, part: { state: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
    // listingKey stands for listingIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, listingKey]);

  useEffect(() => {
    if (!loggedIn) return; // nothing to ask: the profile below is then "none"
    let cancelled = false;
    fetchQuery<useCheckoutAllergensProfileQuery>(environment, profileQuery, {}, { fetchPolicy: 'network-only' })
      .toPromise()
      .then((data) => {
        if (cancelled) return;
        const p = data?.preferences;
        setProfile({
          state: 'ready',
          value:
            p && (p.allergies.length > 0 || p.avoid.length > 0) ? { allergies: p.allergies, avoid: p.avoid } : null,
        });
      })
      .catch((e: unknown) => {
        if (cancelled || e instanceof UnauthenticatedError) return; // an ended login is the login gate's to handle
        // A login that is not a customer's has no profile to check; anything else means we do not know.
        setProfile(isForbidden(e) ? { state: 'ready', value: null } : { state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [environment, loggedIn]);

  const hasProfile = profile.state === 'ready' && profile.value !== null;
  useEffect(() => {
    if (!hasProfile || cart.lines.length === 0) return;
    let cancelled = false;
    fetchQuery<useCheckoutAllergensCheckQuery>(
      environment,
      checkQuery,
      { lines: cart.lines.map((l) => ({ listingId: l.listingId, optionIds: l.modifiers.map((m) => m.id) })) },
      { fetchPolicy: 'network-only' },
    )
      .toPromise()
      .then((data) => {
        if (cancelled) return;
        const found = data?.cartCheck ?? [];
        const conflicts: LineConflict[] = [];
        // The check answers line by line, in the order asked.
        found.forEach((line, lineIndex) =>
          line.conflicts.forEach((conflict) => conflicts.push({ lineIndex, conflict })),
        );
        setCheck({ key: linesKey, part: { state: 'ready', value: conflicts } });
      })
      .catch((e: unknown) => {
        if (!cancelled && !(e instanceof UnauthenticatedError)) setCheck({ key: linesKey, part: { state: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
    // linesKey stands for the lines' ids and options (a change of quantity needs no new check)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, hasProfile, linesKey]);

  return {
    labels,
    // An answer for an older cart is not the answer for this one: until the new one arrives the part is loading.
    listings: listings.key === listingKey ? listings.part : { state: 'loading' },
    profile,
    check: !hasProfile ? { state: 'idle' } : check.key === linesKey ? check.part : { state: 'loading' },
  };
}
