import {
  estimatedTotalCents,
  formatMoney,
  lineAllergenSentences,
  lineTotalCents,
  MAX_QUANTITY,
  removeLine,
  setQuantity,
  type Cart,
} from '@bakery/customer-core';
import { cartStore } from '../lib/cart/useCart.ts';
import type { CheckoutAllergens } from './useCheckoutAllergens';

const money = (cents: number) => formatMoney({ cents, currency: 'USD' });

/** The order's lines with what each contains, a quantity and a remove button, and the estimated total. Estimates only: the server prices the order. */
export function CheckoutLines({
  cart,
  info,
  onOrderChanged,
}: {
  cart: Cart;
  info: CheckoutAllergens;
  /** The customer changed a line: a notice about the order as it was no longer applies. */
  onOrderChanged: () => void;
}) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Quantity</th>
            <th scope="col">Estimate</th>
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cart.lines.map((line, i) => (
            <tr key={`${line.listingId}|${line.modifiers.map((m) => m.id).join(',')}`} data-testid="order-line">
              <td>
                {line.name}
                {line.modifiers.length ? <small> — {line.modifiers.map((m) => m.name).join(', ')}</small> : null}
                {info.listings.state === 'ready' ? (
                  <div>
                    <small data-testid="line-allergens">
                      {lineAllergenSentences(info.listings.value.get(line.listingId), line.modifiers, info.labels).join(
                        '. ',
                      )}
                    </small>
                  </div>
                ) : info.listings.state === 'failed' ? (
                  <div>
                    <small data-testid="line-allergens-failed">
                      Allergen information could not be loaded. Check with the bakery.
                    </small>
                  </div>
                ) : null}
              </td>
              <td>
                <select
                  aria-label={`Quantity of ${line.name}`}
                  value={line.quantity}
                  onChange={(e) => {
                    cartStore.update((c) => setQuantity(c, i, Number(e.target.value)));
                    onOrderChanged();
                  }}
                >
                  {Array.from(
                    { length: Math.min(MAX_QUANTITY, line.maxPerOrder ?? MAX_QUANTITY) },
                    (_, n) => n + 1,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              <td>{money(lineTotalCents(line))}</td>
              <td>
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => {
                    cartStore.update((c) => removeLine(c, i));
                    onOrderChanged();
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p data-testid="estimate">
        Estimated total <strong>{money(estimatedTotalCents(cart))}</strong>{' '}
        <small>The final price is worked out by the bakery&apos;s own prices when you place the order.</small>
      </p>
    </>
  );
}
