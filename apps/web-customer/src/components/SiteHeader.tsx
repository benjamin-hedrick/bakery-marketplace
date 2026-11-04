import Link from 'next/link';
import { useRouter } from 'next/router';
import { cartCount } from '../lib/cart/cart.ts';
import { useCart } from '../lib/cart/useCart.ts';
import { logout, startLogin, useSession } from '../lib/session';

/** The header on every page: the way home, who is logged in, and log in / log out. */
export function SiteHeader() {
  const session = useSession();
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
        {session.status === 'user' ? (
          <>
            <Link href="/orders" data-testid="orders-link">
              Order history
            </Link>{' '}
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
