import { useEffect, useState } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { usePersonalizationListQuery } from '../__generated__/usePersonalizationListQuery.graphql';
import type { usePersonalizationOneQuery } from '../__generated__/usePersonalizationOneQuery.graphql';
import type { usePersonalizationProfileQuery } from '../__generated__/usePersonalizationProfileQuery.graphql';
import { hasItemConflict, marksFor, profileFromPreferences, type ConflictView, type Mark } from '@bakery/customer-core';
import { useSession } from '../lib/session';
import type { DietNote } from '@bakery/customer-core';

// WI-CUST-006: the customer's own conflicts, laid over the public page after the login. The server-rendered page never knows them. A logged-out
// customer, or one with an empty profile, makes no personalized request: the profile is asked first (a small answer) and only a non-empty one
// leads to the list. Everything is network-only and kept in this component; nothing is stored for the next person on the device.

const profileQuery = graphql`
  query usePersonalizationProfileQuery {
    preferences {
      allergies
      avoid
      prefer
    }
  }
`;

const listQuery = graphql`
  query usePersonalizationListQuery {
    tags {
      id
      label
    }
    personalizedListings(first: 20) {
      edges {
        node {
          listing {
            id
            modifiers {
              id
              name
            }
          }
          conflicts {
            allergenId
            severity
            source
            optionIds
          }
          dietMatches {
            tagId
            marked
            itemMarked
            optionIdsNotMarked
          }
        }
      }
    }
  }
`;

const oneQuery = graphql`
  query usePersonalizationOneQuery($id: ID!) {
    tags {
      id
      label
    }
    personalizedListing(id: $id) {
      listing {
        id
        modifiers {
          id
          name
        }
      }
      conflicts {
        allergenId
        severity
        source
        optionIds
      }
      dietMatches {
        tagId
        marked
        itemMarked
        optionIdsNotMarked
      }
    }
  }
`;

/** What the page needs for one listing: its marks, and whether the item itself conflicts. */
export interface ListingMarks {
  marks: Mark[];
  itemConflict: boolean;
  /** How the listing stands against each diet the customer prefers (WI-TAG-004): the bakery's claim, never a finding. */
  diets: DietNote[];
}

export type Personalization = ReadonlyMap<string, ListingMarks>;

type Environment = ReturnType<typeof useRelayEnvironment>;

function build(
  labels: ReadonlyMap<string, string>,
  listing: { id: string; modifiers: readonly { id: string; name: string }[] },
  conflicts: readonly ConflictView[],
  dietMatches: readonly {
    tagId: string;
    marked: boolean;
    itemMarked: boolean;
    optionIdsNotMarked: readonly string[];
  }[],
): ListingMarks {
  const optionNames = new Map(listing.modifiers.map((m) => [m.id, m.name]));
  return {
    marks: marksFor(conflicts, labels, optionNames),
    itemConflict: hasItemConflict(conflicts),
    diets: dietMatches.map((m) => ({
      tagId: m.tagId,
      label: labels.get(m.tagId) ?? m.tagId,
      marked: m.marked,
      itemMarked: m.itemMarked,
      optionNames: m.optionIdsNotMarked.map((id) => optionNames.get(id) ?? 'An option'),
    })),
  };
}

/**
 * Runs `load` once the customer is logged in and has a non-empty profile; null until then and for ever after if anything fails (the public page is
 * then simply what it was: a missing overlay must never break browsing). `key` restarts the work when the thing being looked at changes.
 */
function usePersonalized<T>(key: string, load: (environment: Environment) => Promise<T | null>): T | null {
  const session = useSession();
  const environment = useRelayEnvironment();
  const [result, setResult] = useState<{ key: string; value: T } | null>(null);
  const loggedIn = session.status === 'user';

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetchQuery<usePersonalizationProfileQuery>(environment, profileQuery, {}, { fetchPolicy: 'network-only' })
      .toPromise()
      .then((profile) => {
        if (profileFromPreferences(profile?.preferences) === null) return null; // nothing saved: nothing to overlay
        return load(environment);
      })
      .then((value) => {
        if (!cancelled && value) setResult({ key, value });
      })
      .catch(() => {
        // A vendor's login is refused the customer's views, an ended login is handled by the login gate, a failure leaves the public page.
      });
    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure on every render; `key` stands for what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, environment, key]);

  return loggedIn && result?.key === key ? result.value : null;
}

/** The marks of every listing on the home page, by listing id; null when there is nothing to show. */
export function usePersonalizedList(): Personalization | null {
  return usePersonalized('list', async (environment) => {
    const data = await fetchQuery<usePersonalizationListQuery>(
      environment,
      listQuery,
      {},
      { fetchPolicy: 'network-only' },
    ).toPromise();
    if (!data) return null;
    const labels = new Map(data.tags.map((t) => [t.id, t.label]));
    return new Map(
      data.personalizedListings.edges.map(({ node }) => [
        node.listing.id,
        build(labels, node.listing, node.conflicts, node.dietMatches),
      ]),
    );
  });
}

/** The marks of one listing; null when there is nothing to show. */
export function usePersonalizedListing(id: string): ListingMarks | null {
  return usePersonalized(`one:${id}`, async (environment) => {
    const data = await fetchQuery<usePersonalizationOneQuery>(
      environment,
      oneQuery,
      { id },
      { fetchPolicy: 'network-only' },
    ).toPromise();
    if (!data?.personalizedListing) return null;
    const labels = new Map(data.tags.map((t) => [t.id, t.label]));
    return build(
      labels,
      data.personalizedListing.listing,
      data.personalizedListing.conflicts,
      data.personalizedListing.dietMatches,
    );
  });
}
