// Login failure codes and their fixed texts. No imports: this module is safe to load in the browser (the error page uses it), unlike the rest of the package.
export type LoginErrorCode =
  | 'no_pending'
  | 'state_mismatch'
  | 'expired'
  | 'issuer_error'
  | 'missing_code'
  | 'exchange_failed'
  | 'bad_token'
  | 'rate_limited';

// Fixed text only: nothing the issuer says, and never a token, ends up in a message.
export const LOGIN_MESSAGES: Record<LoginErrorCode, string> = {
  no_pending: 'There is no login in progress. Please start again.',
  state_mismatch: 'The login response did not match the request. Please start again.',
  expired: 'The login took too long. Please start again.',
  issuer_error: 'The login was not completed.',
  missing_code: 'The login response was incomplete. Please start again.',
  exchange_failed: 'We could not complete the login. Please try again.',
  bad_token: 'We could not complete the login. Please try again.',
  rate_limited: 'Too many login attempts. Please wait a minute and try again.',
};

/** The text for a code from the error page's query string; a code that is not one of ours gets the general text. */
export function loginMessage(code: unknown): string {
  return typeof code === 'string' && Object.hasOwn(LOGIN_MESSAGES, code)
    ? LOGIN_MESSAGES[code as LoginErrorCode]
    : LOGIN_MESSAGES.exchange_failed;
}
