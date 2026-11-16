import Link from 'next/link';
import { removeLine, setQuantity, type Cart } from '@bakery/customer-core';
import { cartStore } from '../lib/cart/useCart.ts';

/** A typed rejection of the order (nothing was placed). */
export interface Rejection {
  kind: 'rejected';
  code: string;
  message: string;
  fields: readonly { field: string; message: string }[];
  shortfalls: readonly { listingId: string; available: number }[];
}

/** What went wrong with the last attempt: a rejection, or an unexpected error with the reference to quote. */
export type Problem = Rejection | { kind: 'error'; reference: string | undefined };

/** What went wrong, what it means for this order, and (where there is one) the thing the customer can do about it. */
export function ProblemNotice({
  problem,
  cart,
  onOrderChanged,
}: {
  problem: Problem;
  cart: Cart;
  /** The customer changed the order in response to the notice, which was about the old order, so it should go. */
  onOrderChanged: () => void;
}) {
  if (problem.kind === 'error') {
    return (
      <section role="alert" data-testid="checkout-error">
        <p>We could not place your order. Nothing has been charged. Please try again in a moment.</p>
        {problem.reference ? <small>If it keeps happening, quote reference {problem.reference}.</small> : null}
      </section>
    );
  }

  return (
    <section role="alert" data-testid="checkout-rejection" data-code={problem.code}>
      <p>{problem.message}</p>
      {problem.code === 'INSUFFICIENT_STOCK'
        ? problem.shortfalls.map((s) => {
            const at = cart.lines.findIndex((l) => l.listingId === s.listingId);
            const line = cart.lines[at];
            if (!line) return null;
            return (
              <p key={s.listingId} data-testid="shortfall">
                {line.name}: {s.available === 0 ? 'none left' : `only ${s.available} available`}.{' '}
                {s.available > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      cartStore.update((c) => setQuantity(c, at, s.available));
                      onOrderChanged();
                    }}
                  >
                    Change to {s.available}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      cartStore.update((c) => removeLine(c, at));
                      onOrderChanged();
                    }}
                  >
                    Remove it
                  </button>
                )}
              </p>
            );
          })
        : null}
      {problem.code === 'LISTING_UNAVAILABLE' ? <Link href="/">Back to the bakeries</Link> : null}
      {problem.fields.length > 0 ? (
        <ul>
          {problem.fields.map((f) => (
            <li key={`${f.field}:${f.message}`}>{f.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
