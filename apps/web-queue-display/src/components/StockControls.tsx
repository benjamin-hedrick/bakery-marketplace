import { useState } from 'react';
import { graphql } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { StockControlsRefreshQuery } from '../__generated__/StockControlsRefreshQuery.graphql';
import { getBrowserEnvironment } from '../lib/relay/environment';
import { LISTING_TEXT, parseWhole, type LoadedListing } from '../lib/listings';
import { readListing } from './ListingFields';
import { adjustStock } from './ListingWrites';

// Add, remove and sold out for a counted listing (WI-CAT-008 requirement 3). Each is one adjustment by a number of units: the screen never sends a
// count it read earlier (ADR-0017), so a sale between the read and the click is never undone. A removal the catalog refuses because the count had
// gone down reads the listing again and shows the count as it is now.

const refreshQuery = graphql`
  query StockControlsRefreshQuery($id: ID!) {
    myListing(id: $id) {
      ...ListingFields_listing
    }
  }
`;

interface Props {
  listing: LoadedListing;
  /** The listing as the catalog answered after a change (or after reading it again). */
  onChanged: (listing: LoadedListing) => void;
  /** Words for the vendor about what happened, shown beside the controls and announced. */
  onMessage: (text: string) => void;
  /** Turns the controls off from outside (a save of the same listing in flight). */
  disabled?: boolean;
}

export function StockControls({ listing, onChanged, onMessage, disabled = false }: Props) {
  const [units, setUnits] = useState('1');
  const [busy, setBusy] = useState(false);
  const count = listing.stock.availableQuantity;
  if (count === null || count === undefined) return null; // made to order: nothing to count
  const name = listing.name;
  const fieldId = `units-${listing.id}`;

  const readAgain = async () => {
    try {
      const data = await fetchQuery<StockControlsRefreshQuery>(
        getBrowserEnvironment(),
        refreshQuery,
        { id: listing.id },
        { fetchPolicy: 'network-only' },
      ).toPromise();
      if (data?.myListing) onChanged(readListing(data.myListing));
    } catch {
      /* the message already says the count changed; the next load of the page shows it */
    }
  };

  const change = async (delta: number) => {
    if (delta === 0) return;
    setBusy(true);
    const outcome = await adjustStock(listing.id, delta);
    setBusy(false);
    if (outcome.kind === 'saved') {
      onChanged(outcome.listing);
      onMessage(`${name}: ${outcome.listing.stock.availableQuantity ?? 0} left.`);
      return;
    }
    if (outcome.kind === 'rejected') {
      if (outcome.code === 'INSUFFICIENT_STOCK') {
        onMessage(`${name}: ${LISTING_TEXT.INSUFFICIENT_STOCK}`);
        await readAgain();
        return;
      }
      if (outcome.code === 'INVALID') {
        onMessage(`${name}: ${outcome.fields.map((f) => f.message).join(' ') || LISTING_TEXT.INVALID}`);
        return;
      }
      onMessage(`${name}: ${LISTING_TEXT[outcome.code === 'KEY_REUSED' ? 'FAILED' : outcome.code]}`);
      if (outcome.code === 'MADE_TO_ORDER' || outcome.code === 'CHANGED') await readAgain();
      return;
    }
    onMessage(
      outcome.kind === 'login-ended'
        ? LISTING_TEXT.LOGIN_ENDED
        : outcome.kind === 'forbidden'
          ? LISTING_TEXT.FORBIDDEN
          : `${name}: ${LISTING_TEXT.FAILED}`,
    );
  };

  const amount = parseWhole(units);
  const usable = typeof amount === 'number' && amount > 0;
  const off = disabled || busy;
  const shown = usable ? amount : 1;

  return (
    <div className="stock-controls" data-testid="stock-controls">
      <label htmlFor={fieldId}>
        Units <span className="visually-hidden">for {name}</span>
      </label>
      <input
        id={fieldId}
        className="units"
        inputMode="numeric"
        value={units}
        disabled={off}
        onChange={(e) => setUnits(e.target.value)}
      />
      <button
        type="button"
        disabled={off || !usable}
        aria-label={`Add ${shown} to ${name}`}
        onClick={() => void change(shown)}
      >
        Add
      </button>
      <button
        type="button"
        disabled={off || !usable}
        aria-label={`Remove ${shown} from ${name}`}
        onClick={() => void change(-shown)}
      >
        Remove
      </button>
      <button
        type="button"
        disabled={off || count === 0}
        aria-label={`Mark ${name} sold out`}
        onClick={() => void change(-count)}
      >
        Sold out
      </button>
    </div>
  );
}
