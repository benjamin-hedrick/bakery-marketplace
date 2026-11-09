// How an order is described to its customer. Shared by the order page and the order history so the two always say the same thing.

/** What each status means to the customer. The status itself comes from ordering-service and is shown as it is. */
export const HEADLINES: Record<string, { headline: string; detail: string }> = {
  PLACED: {
    headline: 'Order received',
    detail: 'Waiting for the bakery to confirm it. Refresh to see when it does.',
  },
  CONFIRMED: { headline: 'Order confirmed', detail: 'The bakery has accepted your order.' },
  IN_PREPARATION: { headline: 'Being prepared', detail: 'The bakery has started on your order.' },
  READY_FOR_FULFILLMENT: { headline: 'Ready for pickup', detail: 'Your order is ready.' },
  COMPLETED: { headline: 'Picked up', detail: 'Thank you.' },
  CANCELLED: { headline: 'Order cancelled', detail: 'This order was cancelled.' },
  PENDING: { headline: 'Not placed yet', detail: 'This order has not been placed.' },
};

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * A short reference a customer can read out: the last six characters of the order's own id, upper case. It is the same rule as the vendor's queue and
 * the e-mails (ordering's `OrderReference`, notification's `Reference`), so what the customer reads out is what the bakery sees on its screen. The global
 * id is an opaque string: the service id is taken from inside it.
 */
export function referenceOf(globalId: string): string {
  let serviceId: string;
  try {
    const text = atob(globalId);
    serviceId = text.slice(text.indexOf(':') + 1);
  } catch {
    serviceId = globalId;
  }
  return (serviceId.length <= 6 ? serviceId : serviceId.slice(-6)).toUpperCase();
}
