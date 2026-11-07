// How a customer's order page keeps its status current (the lead's decision, 2026-11-07: polling for the customer; the vendor's screen has the push
// mechanism, ADR-0021). The rules, with no React, Relay or network in them, so they are tested with a fake clock and shared by the web app and the
// Android app:
//  - read at once, then every few seconds while the order can still change; stop for good once it is completed or cancelled;
//  - one read at a time: a slow read is never doubled by the next tick or by a press of "refresh";
//  - skip the read while the page is hidden (a background tab, an app that is not in front) and read as soon as it is shown again;
//  - a failed read keeps what the page already shows (the caller says so) and tries again later, a little slower each time, and goes back to the
//    normal pace after one that works;
//  - nothing a read returns after `stop()` reaches the caller.

export const ORDER_POLL_MS = 5000;
const MAX_BACKOFF_MS = 30_000;

/** The statuses after which an order never changes again. A status this code does not know is treated as one that can still change. */
export const isFinalOrderStatus = (status: string): boolean => status === 'COMPLETED' || status === 'CANCELLED';

export interface OrderPollerOptions<T> {
  /** One read of the order. A rejection is a failed read. */
  read(): Promise<T>;
  /** The order's status in what `read` returned; null when there is no such order (nothing more to wait for). */
  statusOf(value: T): string | null;
  onValue(value: T): void;
  /** A read failed; `consecutive` is how many in a row. The caller keeps what it shows and may say it could not refresh. */
  onFailure(consecutive: number): void;
  /** False while the page is hidden: the timer's reads are skipped. Reads asked for by `refreshNow` are not. Default: always visible. */
  isVisible?(): boolean;
  intervalMs?: number;
}

export class OrderPoller<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private done = false;
  private inFlight = false;
  private failures = 0;
  private readonly o: OrderPollerOptions<T>;

  constructor(options: OrderPollerOptions<T>) {
    this.o = options;
  }

  /** Reads now, then on the timer. Calling it again while running does nothing. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.done = false;
    this.failures = 0;
    void this.tick(true);
  }

  /** Ends everything: no timer, and the answer of a read that is still under way is dropped. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Reads now (the customer pressed refresh, or the page came back to the front). A read already under way is not doubled. Works after the order is final. */
  refreshNow(): void {
    if (this.stopped || this.inFlight) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.done = false;
    void this.tick(true);
  }

  private async tick(force: boolean): Promise<void> {
    if (this.stopped || this.inFlight) return;
    if (!force && this.o.isVisible && !this.o.isVisible()) return this.schedule();
    this.inFlight = true;
    try {
      const value = await this.o.read();
      if (this.stopped) return;
      this.failures = 0;
      this.o.onValue(value);
      const status = this.o.statusOf(value);
      if (status === null || isFinalOrderStatus(status)) this.done = true; // nothing more will change
    } catch {
      if (this.stopped) return;
      this.failures++;
      this.o.onFailure(this.failures);
    } finally {
      this.inFlight = false;
    }
    if (!this.stopped && !this.done) this.schedule();
  }

  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    const base = this.o.intervalMs ?? ORDER_POLL_MS;
    const delay = Math.min(MAX_BACKOFF_MS, base * 2 ** Math.min(this.failures, 3)); // 1x, 2x, 4x, 8x of the interval, at most 30 s
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.tick(false);
    }, delay);
  }
}
