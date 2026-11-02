import { useRouter } from 'next/router';
import { logout, startLogin, useSession } from '../lib/session';

/** The header on every page: what this screen is, who is logged in, and log in / log out. */
export function SiteHeader() {
  const session = useSession();
  const router = useRouter();

  return (
    <header className="site-header">
      <span className="site-title">Order queue</span>
      <nav aria-label="Account">
        {session.status === 'user' ? (
          <>
            <span data-testid="user-name">{session.user.name ?? session.user.subject}</span>{' '}
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </>
        ) : session.status === 'anonymous' ? (
          <button type="button" onClick={() => startLogin(router.asPath)}>
            Log in
          </button>
        ) : null}
      </nav>
    </header>
  );
}
