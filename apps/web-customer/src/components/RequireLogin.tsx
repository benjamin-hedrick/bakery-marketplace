import type { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { loginMessage } from '@bakery/web-session/messages';
import { refreshSession, startLogin, useSession } from '../lib/session';

/**
 * Wraps a page that needs a login (checkout, an order). Without one it offers to log in and brings the user back to this page. This is only about
 * what to show: the services decide what a login may do, so removing this gate would not expose anything.
 */
export function RequireLogin({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  if (session.status === 'user') return <>{children}</>;
  if (session.status === 'unknown') return <p data-testid="login-checking">Checking your login…</p>;
  if (session.status === 'unavailable')
    // The login cannot be checked just now (register 195): not "please log in", which would also fail. Try again asks the server again.
    return (
      <section role="alert" data-testid="login-unavailable">
        <p>{loginMessage('unavailable')}</p>
        <button type="button" onClick={() => void refreshSession()}>
          Try again
        </button>
      </section>
    );
  return (
    <section data-testid="login-required">
      <p>Please log in to continue.</p>
      <button type="button" onClick={() => startLogin(router.asPath)}>
        Log in
      </button>
    </section>
  );
}
