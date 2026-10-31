import Link from 'next/link';
import { useRouter } from 'next/router';
import { logout, startLogin } from '../lib/auth/browser.ts';
import { useSession } from '../lib/auth/useSession.ts';
import { cartCount } from '../lib/cart/cart.ts';
import { useCart } from '../lib/cart/useCart.ts';

/** The header on every page: the way home, who is logged in, and log in / log out. */
export function SiteHeader() {
  const who = useSession();
  const router = useRouter();
  const count = cartCount(useCart());

  return (
    <header className="site-header">
      <Link href="/">Bakery Marketplace</Link>
      <nav aria-label="Account">
        {count > 0 ? (
          <>
            <Link href="/checkout" data-testid="cart-link">
              Your order ({count})
            </Link>{' '}
          </>
        ) : null}
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
