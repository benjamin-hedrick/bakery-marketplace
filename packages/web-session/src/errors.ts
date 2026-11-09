// The two errors a web app's GraphQL client throws. No imports: like messages.ts this module is safe to load in the browser, and both web apps use it
// (the customer app and the queue display), so what a page does with them is written once.

/** The BFF said the login is missing or no longer accepted. The session has been ended; the page should offer to log in again. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Your login has ended. Please log in again.');
    this.name = 'UnauthenticatedError';
  }
}

export interface GraphQLErrorEntry {
  message: string;
  extensions?: { code?: string; reference?: string };
}

/** The BFF answered with errors (not an expected failure, which comes back as data). `reference` is the trace id to quote when asking for help. */
export class GraphQLRequestError extends Error {
  readonly codes: string[];
  readonly reference: string | undefined;
  constructor(errors: GraphQLErrorEntry[]) {
    super(`GraphQL errors: ${errors.map((e) => e.message).join('; ')}`);
    this.name = 'GraphQLRequestError';
    this.codes = errors.map((e) => e.extensions?.code).filter((c): c is string => typeof c === 'string');
    this.reference = errors.find((e) => typeof e.extensions?.reference === 'string')?.extensions?.reference;
  }
}
