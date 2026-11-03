// Which buttons a vendor's order card offers (WI-QUE-004). A hint only: ordering-service decides whether an action is allowed, who may do it and
// what it changes. The words are display text; the codes are the BFF's enum.

export type VendorAction = 'CONFIRM' | 'DECLINE' | 'START_PREPARATION' | 'MARK_READY' | 'COMPLETE';

export interface ActionButton {
  action: VendorAction;
  label: string;
  /** Set when the action is hard to take back: the first click asks this, the second sends. */
  confirmText?: string;
}

const ACTIONS_BY_STATUS: Record<string, ActionButton[]> = {
  PLACED: [
    { action: 'CONFIRM', label: 'Accept' },
    { action: 'DECLINE', label: 'Decline', confirmText: 'Decline this order?' },
  ],
  CONFIRMED: [{ action: 'START_PREPARATION', label: 'Start preparing' }],
  IN_PREPARATION: [{ action: 'MARK_READY', label: 'Mark ready' }],
  READY_FOR_FULFILLMENT: [{ action: 'COMPLETE', label: 'Handed over' }],
};

/** The buttons for an order in this status; none for a status this screen knows no action for. */
export function actionsFor(status: string): ActionButton[] {
  return ACTIONS_BY_STATUS[status] ?? [];
}

export type ActionOutcome =
  { kind: 'done' } | { kind: 'changed' } | { kind: 'missing' } | { kind: 'login-ended' } | { kind: 'failed' };

/** What the vendor is told for each outcome, in words (never a code or the service's text). */
export const OUTCOME_TEXT: Record<Exclude<ActionOutcome['kind'], 'done'>, string> = {
  changed: 'This order has changed. The queue is up to date.',
  missing: 'That order could not be found. It may have been removed.',
  'login-ended': 'Your login has ended. Please log in again.',
  failed: 'That did not work. Please try again.',
};
