import Link from 'next/link';
import { useState } from 'react';
import { addLine, lineTotalCents, MAX_QUANTITY, type CartLine } from '../lib/cart/cart.ts';
import { cartStore } from '../lib/cart/useCart.ts';
import { formatMoney } from '../lib/money';
import { canOrder, type StockStatus } from './StockBadge';

interface Money {
  cents: number;
  currency: string;
}

export interface OrderableListing {
  id: string;
  vendorId: string;
  name: string;
  price: Money;
  modifiers: readonly { id: string; name: string; priceDelta: Money; allergens: readonly string[] }[];
  stock: { status: StockStatus; maxPerOrder: number | null | undefined };
}

type Notice = 'added' | 'capped' | 'other_vendor' | 'too_many_lines';

/**
 * Choose options and a quantity and put the item in the order. These are choices and hints only: ordering-service prices the order from the
 * catalog, enforces the limits and decides whether it can be placed, so nothing here is trusted.
 */
export function AddToOrder({ listing }: { listing: OrderableListing }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!canOrder(listing.stock.status)) {
    return <p data-testid="not-orderable">This item cannot be ordered right now.</p>;
  }

  const maxQuantity = Math.min(MAX_QUANTITY, listing.stock.maxPerOrder ?? MAX_QUANTITY);
  const line: CartLine = {
    listingId: listing.id,
    name: listing.name,
    unitPriceCents: listing.price.cents,
    currency: listing.price.currency,
    modifiers: listing.modifiers
      .filter((m) => chosen.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, priceDeltaCents: m.priceDelta.cents })),
    quantity,
    maxPerOrder: listing.stock.maxPerOrder ?? null,
  };

  function add(replaceOrder = false) {
    let outcome: Notice = 'added';
    cartStore.update((current) => {
      const result = addLine(replaceOrder ? { vendorId: null, lines: [] } : current, listing.vendorId, line);
      if ('error' in result) {
        outcome = result.error === 'other_vendor' ? 'other_vendor' : 'too_many_lines';
        return current;
      }
      outcome = result.capped ? 'capped' : 'added';
      return result.cart;
    });
    setNotice(outcome);
  }

  return (
    <form
      aria-label="Add to your order"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <fieldset>
        <legend>Options</legend>
        {listing.modifiers.length === 0 ? <p>No options for this item.</p> : null}
        {listing.modifiers.map((m) => (
          <div key={m.id}>
            <label>
              <input
                type="checkbox"
                checked={chosen.has(m.id)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(m.id);
                  else next.delete(m.id);
                  setChosen(next);
                  setNotice(null);
                }}
              />{' '}
              {m.name} (+{formatMoney(m.priceDelta)}){m.allergens.length ? ` — contains ${m.allergens.join(', ')}` : ''}
            </label>
          </div>
        ))}
      </fieldset>
      <p>
        <label>
          Quantity{' '}
          <select
            value={quantity}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
              setNotice(null);
            }}
          >
            {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>{' '}
        <span data-testid="line-estimate">
          {formatMoney({ cents: lineTotalCents(line), currency: listing.price.currency })}
        </span>
      </p>
      <button type="submit">Add to order</button>

      {notice === 'added' || notice === 'capped' ? (
        <p role="status" data-testid="add-notice">
          {notice === 'capped' ? `Added, limited to ${maxQuantity} per order. ` : 'Added to your order. '}
          <Link href="/checkout">View your order</Link>
        </p>
      ) : null}
      {notice === 'other_vendor' ? (
        <p role="alert" data-testid="add-notice">
          Your order has items from another bakery. An order is placed with one bakery at a time.{' '}
          <button type="button" onClick={() => add(true)}>
            Start a new order with this item
          </button>
        </p>
      ) : null}
      {notice === 'too_many_lines' ? (
        <p role="alert" data-testid="add-notice">
          Your order is full. <Link href="/checkout">Place it</Link> first, or remove an item.
        </p>
      ) : null}
    </form>
  );
}
