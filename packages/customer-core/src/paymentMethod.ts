// Saved payment methods at checkout (WI-ORD-010). The customer chooses one; only its id is sent. The token, and the rule that decides whether it is valid,
// stay in ordering-service (ADR-0005, ADR-0007), so nothing here knows what a token looks like. Pure and shared by the web app and the Android app.

/** A saved payment method as the BFF shows it: an id to choose it by and a description. There is no card number, brand, expiry or token. */
export interface PaymentMethod {
  id: string;
  description: string;
}

/**
 * The method a checkout form shows chosen. The customer's pick if it is still one of the customer's methods, otherwise the first (the order the BFF
 * gives them, accepted ones first in the seed data), otherwise null: with no methods an order cannot be placed.
 */
export function selectedPaymentMethodId(methods: readonly PaymentMethod[], picked: string | null): string | null {
  if (picked !== null && methods.some((m) => m.id === picked)) return picked;
  return methods[0]?.id ?? null;
}

/** The sentence shown in place of the form's place button when there is nothing to pay with. */
export const NO_PAYMENT_METHODS_TEXT = 'You have no saved payment method, so an order cannot be placed.';
