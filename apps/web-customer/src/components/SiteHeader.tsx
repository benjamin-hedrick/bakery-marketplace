import Link from 'next/link';
import { useRouter } from 'next/router';
import { logout, startLogin } from '../lib/auth/browser.ts';
import { useSession } from '../lib/auth/useSession.ts';

/** The header on every page: the way home, who is logged in, and log in / log out. */
export function SiteHeader() {
  const who = useSession();
  const router = useRouter();

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
      <Link href="/">Bakery Marketplace</Link>
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
