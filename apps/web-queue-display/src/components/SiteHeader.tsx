import Link from 'next/link';
import { useRouter } from 'next/router';
import { logout, startLogin, useSession } from '../lib/session';

const PAGES = [
  { href: '/', label: 'Order queue', current: (path: string) => path === '/' },
  { href: '/listings', label: 'Listings', current: (path: string) => path.startsWith('/listings') },
];

/** The header on every page of the vendor's web app: its pages (the queue and the listings, WI-CAT-008), who is logged in, and log in / log out. */
export function SiteHeader() {
  const session = useSession();
  const router = useRouter();

  return (
    <header className="site-header">
      <span className="site-title">Bakery</span>
      <nav aria-label="Pages" className="site-pages">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} aria-current={p.current(router.pathname) ? 'page' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
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
