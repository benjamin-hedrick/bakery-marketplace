import { useEffect, useRef, useState } from 'react';
import { graphql } from 'react-relay';
import { commitMutation } from 'relay-runtime';
import type { OrderActionsMutation, OrderActionsMutation$data } from '../__generated__/OrderActionsMutation.graphql';
import { getBrowserEnvironment, UnauthenticatedError } from '../lib/relay/environment';
import { actionsFor, OUTCOME_TEXT, type ActionButton, type ActionOutcome, type VendorAction } from '../lib/actions';

// The vendor's actions on one order card (WI-QUE-004). The mutation's answer does not edit the board: the board asks for the list again and the
// stream delivers the change, so there is one source of truth (sequence numbers decide, WI-QUE-003).
const actionMutation = graphql`
  mutation OrderActionsMutation($input: VendorOrderActionInput!) {
    vendorOrderAction(input: $input) {
      __typename
      ... on VendorOrderActionDone {
        orderId
        status
      }
      ... on VendorOrderActionRejected {
        code
      }
    }
  }
`;

function send(orderId: string, action: VendorAction): Promise<ActionOutcome> {
  return new Promise((resolve) => {
    commitMutation<OrderActionsMutation>(getBrowserEnvironment(), {
      mutation: actionMutation,
      variables: { input: { orderId, action } },
      onCompleted: (data: OrderActionsMutation$data) => {
        const result = data.vendorOrderAction;
        if (result.__typename === 'VendorOrderActionDone') return resolve({ kind: 'done' });
        if (result.__typename === 'VendorOrderActionRejected')
          return resolve({ kind: result.code === 'NOT_FOUND' ? 'missing' : 'changed' });
        resolve({ kind: 'failed' });
      },
      onError: (e: Error) => {
        if (e instanceof UnauthenticatedError) return resolve({ kind: 'login-ended' });
        resolve({ kind: 'failed' }); // including FORBIDDEN: a non-vendor login never gets this far, the board shows its own message
      },
    });
  });
}

interface Props {
  orderId: string;
  reference: string;
  status: string;
  /** Asks the board for the list again, after a refusal or a failure (the screen may be behind). */
  onSettled: () => void;
  onAnnounce: (text: string) => void;
}

export function OrderActions({ orderId, reference, status, onSettled, onAnnounce }: Props) {
  const [busy, setBusy] = useState(false);
  const [askingAt, setAskingAt] = useState<{ action: VendorAction; status: string } | null>(null);
  const [sentFrom, setSentFrom] = useState<string | null>(null); // the status the order had when an action was accepted
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The question "Decline this order?" belongs to the status it was asked at: when the order moves on, it is no longer asked.
  const asking = askingAt?.status === status ? askingAt.action : null;

  const buttons = actionsFor(status);
  if (buttons.length === 0) return null;
  // After an accepted action the buttons stay off until the order shows its new status, so a second click cannot send the same action twice.
  const disabled = busy || sentFrom === status;

  const run = async (button: ActionButton) => {
    setBusy(true);
    setMessage(null);
    setAskingAt(null);
    const outcome = await send(orderId, button.action);
    if (!mounted.current) return;
    setBusy(false);
    if (outcome.kind === 'done') {
      setSentFrom(status);
      onAnnounce(`${button.label}: order ${reference}`);
      // No list is fetched here: the change arrives on the stream (or at the next poll), and a list read that started before ordering's read model
      // caught up could put the order back where it was (register item 133).
    } else {
      setMessage(OUTCOME_TEXT[outcome.kind]);
      onAnnounce(`Order ${reference}: ${OUTCOME_TEXT[outcome.kind]}`);
      onSettled(); // a refusal means the screen was behind: ask for the list so it shows what the service holds
    }
  };

  const click = (button: ActionButton) => {
    if (button.confirmText && asking !== button.action) {
      setAskingAt({ action: button.action, status });
      return;
    }
    void run(button);
  };

  return (
    <div className="order-actions" data-testid="order-actions">
      {buttons.map((b) => (
        <button
          key={b.action}
          type="button"
          className={b.confirmText ? 'secondary' : 'primary'}
          disabled={disabled}
          data-action={b.action}
          aria-label={`${asking === b.action ? 'Confirm: ' : ''}${b.label} order ${reference}`}
          onClick={() => click(b)}
        >
          {asking === b.action ? (b.confirmText ?? b.label) : b.label}
        </button>
      ))}
      {message ? (
        <p role="alert" className="action-problem" data-testid="action-problem">
          {message}
        </p>
      ) : null}
    </div>
  );
}
