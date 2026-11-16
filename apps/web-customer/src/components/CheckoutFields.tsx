import { NO_PAYMENT_METHODS_TEXT, type Part, type PaymentMethod } from '@bakery/customer-core';

export type PickupWindow = { readonly start: string; readonly end: string };

const dayOf = (w: PickupWindow) =>
  new Date(w.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The pickup time: the open windows grouped by day, or no specific time. Shown in the browser's time zone. */
export function PickupTimeField({
  windows,
  selected,
  onSelect,
  onRetry,
}: {
  windows: Part<readonly PickupWindow[]>;
  /** The start of the chosen window, or '' for no specific time. */
  selected: string;
  onSelect: (start: string) => void;
  onRetry: () => void;
}) {
  return (
    <p>
      <label>
        Pickup time{' '}
        <select value={selected} disabled={windows.state !== 'ready'} onChange={(e) => onSelect(e.target.value)}>
          <option value="">No specific time</option>
          {windows.state === 'ready'
            ? Array.from(Map.groupBy(windows.value, dayOf)).map(([day, slots]) => (
                <optgroup key={day} label={day}>
                  {slots.map((w) => (
                    <option key={w.start} value={w.start}>
                      {timeOf(w.start)} – {timeOf(w.end)}
                    </option>
                  ))}
                </optgroup>
              ))
            : null}
        </select>
      </label>{' '}
      {windows.state === 'loading' ? <small>Loading pickup times…</small> : null}
      {windows.state === 'failed' ? (
        <small role="alert" data-testid="windows-failed">
          Pickup times could not be loaded.{' '}
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </small>
      ) : null}
    </p>
  );
}

/** The customer's saved payment methods (WI-ORD-010); the order sends only the id of the chosen one. */
export function PaymentMethodField({
  methods,
  methodId,
  onPick,
  onRetry,
}: {
  methods: Part<readonly PaymentMethod[]>;
  methodId: string | null;
  onPick: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <p>
      <label>
        Payment method{' '}
        <select
          value={methodId ?? ''}
          disabled={methods.state !== 'ready' || methods.value.length === 0}
          onChange={(e) => onPick(e.target.value)}
        >
          {methods.state === 'ready'
            ? methods.value.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.description}
                </option>
              ))
            : null}
        </select>
      </label>{' '}
      {methods.state === 'loading' ? <small>Loading payment methods…</small> : null}
      {methods.state === 'failed' ? (
        <small role="alert" data-testid="payment-methods-failed">
          Payment methods could not be loaded.{' '}
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </small>
      ) : null}
      {methods.state === 'ready' && methods.value.length === 0 ? (
        <small role="alert" data-testid="no-payment-methods">
          {NO_PAYMENT_METHODS_TEXT}
        </small>
      ) : null}
    </p>
  );
}
