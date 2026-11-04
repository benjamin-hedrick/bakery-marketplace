// What checkout knows about allergens (WI-MOB-002), the app's version of the web's `useCheckoutAllergens` (WI-CUST-008). Everything is read fresh from the BFF
// whenever the cart's items or options change and nothing is kept on the device (ADR-0014, ADR-0023): a stored copy could be older than the bakery's last edit.
// Three separate answers, so one failing never hides another: what each item and chosen option contains and the registry's labels (public, for everyone), and,
// for a signed-in customer with a saved profile, their own conflicts (`cartCheck`). The profile belongs to the customer and lives in the services; the app only
// reads it. All of it is advice: the services decide what an order may contain.
import {
  cartCheckLines,
  lineConflictsFromCheck,
  profileFromPreferences,
  type Cart,
  type LineConflict,
  type ListingAllergens,
  type Part,
  type Profile,
} from '@bakery/customer-core';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, gql } from './api';
import {
  ALLERGEN_TAGS,
  CART_CHECK,
  LISTING_ALLERGENS,
  PROFILE,
  type AllergenTagsData,
  type CartCheckData,
  type ListingAllergensData,
  type ProfileData,
} from './queries';

export interface CheckoutAllergens {
  /** The registry's labels for allergen ids. Empty until read or if it cannot be: the words then use the ids. */
  labels: ReadonlyMap<string, string>;
  /** What each listing in the cart contains (by listing id), for everyone. */
  listings: Part<ReadonlyMap<string, ListingAllergens>>;
  /** The customer's saved profile, or null when there is none to check against. `failed` is not the same as having none. */
  profile: Part<Profile | null>;
  /** The conflicts of the cart's lines with the profile, once there is a profile to check against. */
  check: Part<readonly LineConflict[]> | { state: 'idle' };
}

const isCode = (e: unknown, code: string) => e instanceof ApiError && e.code === code;
const isSessionEnded = (e: unknown) => isCode(e, 'UNAUTHENTICATED');

/**
 * `withProfile: false` reads only what each item contains (the order screen); true also reads the profile and checks the cart (checkout).
 * An answer for an older cart is never shown for this one: until the new one arrives the part is `loading`.
 */
export function useCheckoutAllergens(cart: Cart, options: { withProfile: boolean }): CheckoutAllergens {
  const { withProfile } = options;
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
  const [profile, setProfile] = useState<Part<Profile | null>>({ state: 'loading' });
  const [check, setCheck] = useState<{ key: string; part: Part<readonly LineConflict[]> }>({
    key: '',
    part: { state: 'loading' },
  });

  useEffect(() => {
    let cancelled = false;
    gql<AllergenTagsData>(ALLERGEN_TAGS)
      .then((data) => {
        if (!cancelled) setLabels(new Map(data.tags.map((t) => [t.id, t.label])));
      })
      .catch(() => {}); // the words then use the ids; nothing is hidden
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (listingIds.length === 0) return;
    let cancelled = false;
    Promise.all(listingIds.map((id) => gql<ListingAllergensData>(LISTING_ALLERGENS, { id })))
      .then((results) => {
        if (cancelled) return;
        const byId = new Map<string, ListingAllergens>();
        results.forEach((data, i) => {
          if (!data.listing) return; // no longer on offer: checkout itself will say so
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
  }, [listingKey]);

  useEffect(() => {
    if (!withProfile) return;
    let cancelled = false;
    gql<ProfileData>(PROFILE, {}, { authenticated: true })
      .then((data) => {
        if (!cancelled) setProfile({ state: 'ready', value: profileFromPreferences(data.preferences) });
      })
      .catch((e: unknown) => {
        if (cancelled || isSessionEnded(e)) return; // an ended session sends the customer to the login screen
        // A login that is not a customer's has no profile to check; anything else means we do not know.
        setProfile(isCode(e, 'FORBIDDEN') ? { state: 'ready', value: null } : { state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [withProfile]);

  const hasProfile = profile.state === 'ready' && profile.value !== null;
  useEffect(() => {
    if (!withProfile || !hasProfile || cart.lines.length === 0) return;
    let cancelled = false;
    gql<CartCheckData>(CART_CHECK, { lines: cartCheckLines(cart.lines) }, { authenticated: true })
      .then((data) => {
        if (cancelled) return;
        setCheck({ key: linesKey, part: { state: 'ready', value: lineConflictsFromCheck(data.cartCheck) } });
      })
      .catch((e: unknown) => {
        if (!cancelled && !isSessionEnded(e)) setCheck({ key: linesKey, part: { state: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
    // linesKey stands for the lines' ids and options (a change of quantity needs no new check)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withProfile, hasProfile, linesKey]);

  return {
    labels,
    listings: listings.key === listingKey ? listings.part : { state: 'loading' },
    profile: withProfile ? profile : { state: 'ready', value: null },
    check: !withProfile || !hasProfile ? { state: 'idle' } : check.key === linesKey ? check.part : { state: 'loading' },
  };
}
