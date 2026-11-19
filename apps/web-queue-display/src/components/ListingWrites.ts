import { graphql } from 'react-relay';
import { commitMutation } from 'relay-runtime';
import type { GraphQLTaggedNode, MutationParameters } from 'relay-runtime';
import type { ListingFields_listing$key } from '../__generated__/ListingFields_listing.graphql';
import type { ListingWritesAdjustMutation } from '../__generated__/ListingWritesAdjustMutation.graphql';
import type { ListingWritesCreateMutation } from '../__generated__/ListingWritesCreateMutation.graphql';
import type { ListingWritesUpdateMutation } from '../__generated__/ListingWritesUpdateMutation.graphql';
import { getBrowserEnvironment, GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';
import type { ListingInput, LoadedListing } from '../lib/listings';
import { readListing } from './ListingFields';

// The vendor's listing writes (WI-CAT-007's operations, WI-CAT-008's screens). Each answer is one of the outcomes below; the catalog decides every
// rule, and the screens word the outcome. Nothing here retries by itself: a retry is the vendor's click, with the same key or edit version.

const createMutation = graphql`
  mutation ListingWritesCreateMutation($input: ListingInput!, $key: String!) {
    createListing(input: $input, idempotencyKey: $key) {
      __typename
      ... on ListingWriteSuccess {
        listing {
          ...ListingFields_listing
        }
      }
      ... on ListingRejected {
        code
        fields {
          field
          message
        }
        currentEditVersion
      }
    }
  }
`;

const updateMutation = graphql`
  mutation ListingWritesUpdateMutation($id: ID!, $input: ListingInput!, $version: Int!) {
    updateListing(id: $id, input: $input, expectedEditVersion: $version) {
      __typename
      ... on ListingWriteSuccess {
        listing {
          ...ListingFields_listing
        }
      }
      ... on ListingRejected {
        code
        fields {
          field
          message
        }
        currentEditVersion
      }
    }
  }
`;

const adjustMutation = graphql`
  mutation ListingWritesAdjustMutation($id: ID!, $delta: Int!) {
    adjustListingStock(id: $id, delta: $delta) {
      __typename
      ... on ListingWriteSuccess {
        listing {
          ...ListingFields_listing
        }
      }
      ... on ListingRejected {
        code
        fields {
          field
          message
        }
        currentEditVersion
      }
    }
  }
`;

export type RejectionCode =
  'INVALID' | 'NOT_FOUND' | 'VENDOR_NOT_VERIFIED' | 'CHANGED' | 'MADE_TO_ORDER' | 'INSUFFICIENT_STOCK' | 'KEY_REUSED';

export type WriteOutcome =
  | { kind: 'saved'; listing: LoadedListing }
  | {
      kind: 'rejected';
      code: RejectionCode;
      fields: readonly { field: string; message: string }[];
      currentEditVersion: number | null;
    }
  | { kind: 'login-ended' }
  | { kind: 'forbidden' }
  | { kind: 'failed' };

type Payload =
  | { readonly __typename: 'ListingWriteSuccess'; readonly listing: ListingFields_listing$key }
  | {
      readonly __typename: 'ListingRejected';
      readonly code: string;
      readonly fields: readonly { readonly field: string; readonly message: string }[];
      readonly currentEditVersion: number | null | undefined;
    }
  | { readonly __typename: '%other' };

const CODES: readonly string[] = [
  'INVALID',
  'NOT_FOUND',
  'VENDOR_NOT_VERIFIED',
  'CHANGED',
  'MADE_TO_ORDER',
  'INSUFFICIENT_STOCK',
  'KEY_REUSED',
];

function outcomeOf(payload: Payload): WriteOutcome {
  if (payload.__typename === 'ListingWriteSuccess') return { kind: 'saved', listing: readListing(payload.listing) };
  if (payload.__typename === 'ListingRejected' && CODES.includes(payload.code)) {
    return {
      kind: 'rejected',
      code: payload.code as RejectionCode,
      fields: payload.fields,
      currentEditVersion: payload.currentEditVersion ?? null,
    };
  }
  return { kind: 'failed' };
}

function run<T extends MutationParameters>(
  mutation: GraphQLTaggedNode,
  variables: T['variables'],
  pick: (data: T['response']) => Payload,
): Promise<WriteOutcome> {
  return new Promise((resolve) => {
    commitMutation<T>(getBrowserEnvironment(), {
      mutation,
      variables,
      onCompleted: (data) => resolve(outcomeOf(pick(data))),
      onError: (e: Error) => {
        if (e instanceof UnauthenticatedError) return resolve({ kind: 'login-ended' });
        if (e instanceof GraphQLRequestError && e.codes.includes('FORBIDDEN')) return resolve({ kind: 'forbidden' });
        resolve({ kind: 'failed' }); // a timeout, a dropped connection, the BFF down, a refusal by the web app (CSRF, rate limit)
      },
    });
  });
}

/** Creates a listing with the create page's key: the same key with the same input answers the listing it made. */
export const createListing = (input: ListingInput, key: string) =>
  run<ListingWritesCreateMutation>(createMutation, { input, key }, (d) => d.createListing as Payload);

/** Replaces a listing with the input, if it is still at the edit version the form was loaded at. */
export const updateListing = (id: string, input: ListingInput, version: number) =>
  run<ListingWritesUpdateMutation>(updateMutation, { id, input, version }, (d) => d.updateListing as Payload);

/** Adds `delta` (negative to remove) to a counted listing's count, atomically. */
export const adjustStock = (id: string, delta: number) =>
  run<ListingWritesAdjustMutation>(adjustMutation, { id, delta }, (d) => d.adjustListingStock as Payload);
