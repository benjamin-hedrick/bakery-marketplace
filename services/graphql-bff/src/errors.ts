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
