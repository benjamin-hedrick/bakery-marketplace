import type { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { startLogin } from '../lib/auth/browser.ts';
import { useSession } from '../lib/auth/useSession.ts';

/**
 * Wraps a page that needs a login (checkout, an order). Without one it offers to log in and brings the user back to this page. This is
 * only about what to show: the services decide what a token may do, so removing this gate would not expose anything.
 */
export function RequireLogin({ children }: { children: ReactNode }) {
  const who = useSession();
  const router = useRouter();
  if (who) return <>{children}</>;
  return (
    <section data-testid="login-required">
      <p>Please log in to continue.</p>
      <button type="button" onClick={() => void startLogin(router.asPath)}>
        Log in
      </button>
    </section>
  );
}
