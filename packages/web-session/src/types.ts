/** One logged-in browser (ADR-0019). Held server-side, encrypted at rest; the browser carries only the opaque id of it. */
export interface SessionRecord {
  subject: string;
  name: string | undefined;
  email: string | undefined;
  roles: string[];
  accessToken: string;
  /** Absent when the issuer gave none; the session then cannot be renewed and ends with the access token. */
  refreshToken: string | undefined;
  /** When the access token expires, in milliseconds since the epoch. */
  accessExpiresAt: number;
  createdAt: number;
  /** The last time the session was used, to the minute: the idle timeout counts from here. */
  lastSeenAt: number;
  /** When the session ends whatever happens (the absolute lifetime). */
  absoluteExpiresAt: number;
}

/** A login that has been started and not yet finished: what the callback must check. One use only, short lived. */
export interface PendingLogin {
  state: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
}

/** What the page may show about the logged-in user. Never contains a token. */
export interface SessionView {
  subject: string;
  name: string | undefined;
  email: string | undefined;
  roles: string[];
  /** When the session ends at the latest, in milliseconds since the epoch. */
  sessionExpiresAt: number;
}
