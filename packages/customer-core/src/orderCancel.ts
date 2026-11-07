// A customer cancelling their own order. Which statuses allow it is ordering-service's rule (docs/architecture/order-lifecycle.md: a customer may cancel
// while the order is Placed or Confirmed, that is, before the bakery has started on it); this is only the hint that decides whether to show the button,
// and the wording for what happened. Pure, and shared by the web app and the Android app.

const CUSTOMER_CANCELLABLE = new Set(['PLACED', 'CONFIRMED']);

/** Whether to offer a cancel button for an order in this status. A status this code does not know offers none. */
export const customerMayCancel = (status: string): boolean => CUSTOMER_CANCELLABLE.has(status);

/** What happened when the customer asked: it was cancelled, it is too late, the order is gone, or the request did not work. */
export type CancelOutcome = 'cancelled' | 'not_allowed_now' | 'missing' | 'failed';

/** Said in plain words; never a code and never the service's text. */
export const CANCEL_OUTCOME_TEXT: Record<CancelOutcome, string> = {
  cancelled: 'Your order was cancelled.',
  not_allowed_now: 'This order can no longer be cancelled. The bakery may already have started on it.',
  missing: 'We could not find that order.',
  failed: 'We could not cancel the order. It has not changed. Please try again.',
};

/** The question asked before it is sent, because a cancelled order cannot be brought back. */
export const CANCEL_QUESTION = 'Cancel this order?';
