export type StockStatus = 'IN_STOCK' | 'LOW' | 'SOLD_OUT' | '%future added value';

const LABELS: Record<string, string> = { IN_STOCK: 'In stock', LOW: 'Low stock', SOLD_OUT: 'Sold out' };

/** Availability as words, not only colour, so it reads the same to everyone (ADR-0017: customers see a status, never a quantity). */
export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <span data-testid="stock" data-status={status}>
      {LABELS[status] ?? 'Availability unknown'}
    </span>
  );
}

/** A status this app does not recognise is treated as unavailable rather than guessed to be fine. */
export const canOrder = (status: StockStatus) => status === 'IN_STOCK' || status === 'LOW';
