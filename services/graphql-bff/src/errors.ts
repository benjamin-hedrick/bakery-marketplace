import { GraphQLError } from 'graphql';

/** A downstream failure the client must not see the detail of (status, URL, body). Logged server-side only. */
export class DownstreamError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'DownstreamError';
    this.status = status;
  }
}

export const SAFE_INTERNAL_MESSAGE = 'Something went wrong. Please try again.';

/** Maps any unexpected failure to the contract's INTERNAL shape (first-slice contract section 5): fixed message, trace id as reference. */
export function internalError(traceId: string): GraphQLError {
  return new GraphQLError(SAFE_INTERNAL_MESSAGE, { extensions: { code: 'INTERNAL', reference: traceId } });
}

/**
 * An error the client is meant to see: a fixed code and a fixed message, nothing from downstream. Anything else thrown by a resolver is
 * replaced by {@link internalError}. `UNAUTHENTICATED` means log in; `FORBIDDEN` means this role may not do this.
 */
export class ClientError extends GraphQLError {
  constructor(code: 'UNAUTHENTICATED' | 'FORBIDDEN', message: string) {
    super(message, { extensions: { code } });
  }
}

export const unauthenticated = () => new ClientError('UNAUTHENTICATED', 'Please log in to continue.');
export const forbidden = () => new ClientError('FORBIDDEN', 'You do not have access to this.');
