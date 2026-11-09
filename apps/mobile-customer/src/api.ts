// The GraphQL BFF over plain fetch (WI-MOB-001): the app sends the access token as a bearer; an UNAUTHENTICATED answer is refreshed once, then the
// customer goes back to the login screen. Orders and carts are not cached on the device beyond the running session (ADR-0014, ADR-0023).
import { currentAccessToken, renewAfterRejection, signOut } from './auth/session';
import { BFF_URL } from './config';
import { BFF_TIMEOUT_MS, fetchWithin } from './timeout';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

async function send<T>(query: string, variables: object, token: string | null) {
  const res = await fetchWithin(
    BFF_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ query, variables }),
    },
    BFF_TIMEOUT_MS,
  );
  if (res.status === 401) return { unauthenticated: true as const };
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')) return { unauthenticated: true as const };
  return { json };
}

/** Runs one operation. Public reads work without a session; `authenticated` operations need one. */
export async function gql<T>(
  query: string,
  variables: object = {},
  options: { authenticated?: boolean } = {},
): Promise<T> {
  let token = options.authenticated ? await currentAccessToken() : null;
  if (options.authenticated && !token) throw new ApiError('Please sign in.', 'UNAUTHENTICATED');

  let outcome = await send<T>(query, variables, token);
  if ('unauthenticated' in outcome && options.authenticated) {
    if (await renewAfterRejection()) {
      token = await currentAccessToken();
      outcome = await send<T>(query, variables, token);
      if ('unauthenticated' in outcome) {
        // The issuer accepted the renewal but the BFF still rejects the new token (register 152): end the session so the login screen appears.
        await signOut();
      }
    }
    if ('unauthenticated' in outcome) throw new ApiError('Please sign in.', 'UNAUTHENTICATED');
  }
  if ('unauthenticated' in outcome) throw new ApiError('Please sign in.', 'UNAUTHENTICATED');

  const { json } = outcome;
  if (json.errors?.length) throw new ApiError(json.errors[0]!.message, json.errors[0]!.extensions?.code);
  if (!json.data) throw new ApiError('No data.', undefined);
  return json.data;
}
