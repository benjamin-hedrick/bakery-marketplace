import type { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { startLogin, useSession } from '../lib/session';

/**
 * Wraps a page that needs a login (checkout, an order). Without one it offers to log in and brings the user back to this page. This is only about
 * what to show: the services decide what a login may do, so removing this gate would not expose anything.
 */
export function RequireLogin({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  if (session.status === 'user') return <>{children}</>;
  if (session.status === 'unknown') return <p data-testid="login-checking">Checking your login…</p>;
  return (
    <section data-testid="login-required">
      <p>Please log in to continue.</p>
      <button type="button" onClick={() => startLogin(router.asPath)}>
        Log in
      </button>
    </section>
  );
}
