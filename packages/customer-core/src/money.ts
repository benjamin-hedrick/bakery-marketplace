// Money is integer cents + currency (first-slice contract D-1); formatting is display-only.
export function formatMoney(m: { cents: number; currency: string }): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency }).format(m.cents / 100);
}
