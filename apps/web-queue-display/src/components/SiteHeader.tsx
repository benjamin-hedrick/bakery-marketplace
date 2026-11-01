import { useRouter } from 'next/router';
import { logout, startLogin } from '../lib/auth/browser.ts';
import { useSession } from '../lib/auth/useSession.ts';

/** The header on every page: what this screen is, who is logged in, and log in / log out. */
export function SiteHeader() {
  const who = useSession();
  const router = useRouter();

  return (
    <header className="site-header">
      <span className="site-title">Order queue</span>
      <nav aria-label="Account">
        {who ? (
          <>
            <span data-testid="user-name">{who.name ?? who.subject}</span>{' '}
            <button type="button" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void startLogin(router.asPath)}>
            Log in
          </button>
        )}
      </nav>
    </header>
  );
}
