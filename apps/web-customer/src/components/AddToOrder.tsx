import Link from 'next/link';
import { useState } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { AddToOrderStockQuery } from '../__generated__/AddToOrderStockQuery.graphql';
import {
  ADD_REFUSAL_TEXT,
  addLine,
  allergenNames,
  decideAdd,
  lineTotalCents,
  MAX_QUANTITY,
  type AddRefusal,
  type CartLine,
  type FreshStockRead,
} from '@bakery/customer-core';
import { cartStore } from '../lib/cart/useCart.ts';
import { formatMoney } from '@bakery/customer-core';
import { ConflictMarks } from './ConflictMarks';
import { TagChips, type TagView } from './TagChips';
import { canOrder, type StockStatus } from './StockBadge';
import type { Mark } from '@bakery/customer-core';

interface Money {
  cents: number;
  currency: string;
}

export interface OrderableListing {
  id: string;
  vendorId: string;
  name: string;
  price: Money;
  modifiers: readonly {
    id: string;
    name: string;
    priceDelta: Money;
    allergens: readonly string[];
    tags: readonly TagView[];
  }[];
  stock: { status: StockStatus; maxPerOrder: number | null | undefined };
}

const NO_LABELS: ReadonlyMap<string, string> = new Map();

type Notice = 'added' | 'capped' | 'other_vendor' | 'too_many_lines' | AddRefusal;

// Always from the network (WI-CUST-009): the page may show an item in stock that has since sold out, from a stored answer or an open tab. It also
// refreshes the stored listing, so the page's own badge follows what this read found.
const freshStockQuery = graphql`
  query AddToOrderStockQuery($id: ID!) {
    listing(id: $id) {
      id
      stock {
        status
        maxPerOrder
      }
    }
  }
`;

/**
 * Choose options and a quantity and put the item in the order. These are choices and hints only: ordering-service prices the order from the
 * catalog, enforces the limits and decides whether it can be placed, so nothing here is trusted.
 */
export function AddToOrder({
  listing,
  optionMarks,
  allergenLabels = NO_LABELS,
}: {
  listing: OrderableListing;
  /** The registry's labels for allergen ids; without them the ids are shown. */
  allergenLabels?: ReadonlyMap<string, string>;
  /** The customer's own conflicts by option id (WI-CUST-006); absent for everyone else. */
  optionMarks?: ReadonlyMap<string, readonly Mark[]>;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [checking, setChecking] = useState(false);
  const environment = useRelayEnvironment();

  // Why the last press of the button added nothing, shown on the page that is left after the fresh read (which may no longer offer the form).
  const refusal =
    notice === 'sold_out' || notice === 'unavailable' || notice === 'missing' || notice === 'check_failed'
      ? notice
      : null;
  const refusalNotice = refusal ? (
    <p role="alert" data-testid="add-notice" data-refusal={refusal}>
      {ADD_REFUSAL_TEXT[refusal]}
    </p>
  ) : null;

  if (!canOrder(listing.stock.status)) {
    // Not orderable, but the options and their allergens stay visible: dietary-safety information does not depend on availability.
    return (
      <section>
        {refusalNotice}
        <p data-testid="not-orderable">This item cannot be ordered right now.</p>
        {listing.modifiers.length > 0 ? (
          <>
            <h2>Options</h2>
            <ul data-testid="options-readonly">
              {listing.modifiers.map((m) => (
                <li key={m.id}>
                  {m.name} (+{formatMoney(m.priceDelta)})
                  {m.allergens.length ? ` — contains ${allergenNames(m.allergens, allergenLabels)}` : ''}
                  <TagChips tags={m.tags} inline label={`Tags of ${m.name}`} />
                  {optionMarks?.get(m.id) ? (
                    <>
                      {' '}
                      <ConflictMarks marks={optionMarks.get(m.id)!} />
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    );
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

  async function readFreshStock(): Promise<FreshStockRead> {
    try {
      const data = await fetchQuery<AddToOrderStockQuery>(
        environment,
        freshStockQuery,
        { id: listing.id },
        { fetchPolicy: 'network-only' },
      ).toPromise();
      if (!data?.listing) return { kind: 'missing' };
      return { kind: 'listing', stock: data.listing.stock };
    } catch {
      return { kind: 'failed' };
    }
  }

  // Read the stock again, then decide from that read (customer-core `decideAdd`). A read that failed adds nothing and says so. Advice only: checkout's
  // atomic reservation is still the authority.
  async function add(replaceOrder = false) {
    if (checking) return;
    setChecking(true);
    setNotice(null);
    const decision = decideAdd(await readFreshStock());
    setChecking(false);
    if (!decision.allowed) {
      setNotice(decision.refusal);
      return;
    }
    const fresh: CartLine = { ...line, maxPerOrder: decision.maxPerOrder };
    let outcome: Notice = 'added';
    cartStore.update((current) => {
      const result = addLine(replaceOrder ? { vendorId: null, lines: [] } : current, listing.vendorId, fresh);
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
        void add();
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
              {m.name} (+{formatMoney(m.priceDelta)})
              {m.allergens.length ? ` — contains ${allergenNames(m.allergens, allergenLabels)}` : ''}
              <TagChips tags={m.tags} inline label={`Tags of ${m.name}`} />
              {optionMarks?.get(m.id) ? (
                <>
                  {' '}
                  <ConflictMarks marks={optionMarks.get(m.id)!} />
                </>
              ) : null}
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
      <button type="submit" disabled={checking} aria-busy={checking}>
        Add to order
      </button>
      {checking ? <span role="status"> Checking stock…</span> : null}
      {refusalNotice}

      {notice === 'added' || notice === 'capped' ? (
        <p role="status" data-testid="add-notice">
          {notice === 'capped' ? `Added, limited to ${maxQuantity} per order. ` : 'Added to your order. '}
          <Link href="/checkout">View your order</Link>
        </p>
      ) : null}
      {notice === 'other_vendor' ? (
        <p role="alert" data-testid="add-notice">
          Your order has items from another bakery. An order is placed with one bakery at a time.{' '}
          <button type="button" disabled={checking} onClick={() => void add(true)}>
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
