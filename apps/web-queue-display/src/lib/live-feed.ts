// The live feed of the queue display (ADR-0021 decision 7, WI-QUE-003). It decides when the screen is "live" (an open stream of changes) and when it
// is "polling" (asking the list again), when to ask, when to reconnect and when to give up. It knows nothing of React, Relay or the network: those
// are handed in, so the rules can be tested with a fake clock.
//
//  - Polling is always the baseline. While the stream is healthy the list is asked for only as a consistency check (every 60 seconds); while it is
//    not, every 7 seconds, and the stream is retried with a growing delay.
//  - A stream is opened first and the list fetched after it opens, so nothing that changes in between is missed. Changes that arrive while a list
//    is being fetched are held and applied after it, in order, by their sequence numbers (the caller ignores one that is not newer).
//  - A stream is dead when nothing at all has arrived on it for 45 seconds (the BFF pings every 12 and ordering every 15).
//  - A stream the server ends after a healthy life (the token expired, the maximum age) is re-opened at once; one that ends or fails quickly is
//    retried with the delay, so a broken server is not hammered.

export type Mode = 'connecting' | 'live' | 'polling';

export interface StreamHandlers<C> {
  /** The server has accepted the subscription: the stream is established. */
  onOpen(): void;
  /** Bytes arrived on the stream: a change, a heartbeat, anything. */
  onActivity(): void;
  onChange(change: C): void;
  /** The server ended the stream in the normal way. */
  onComplete(): void;
  onError(error: unknown): void;
}

export interface LiveFeedOptions<C> {
  /** Opens a stream; the result closes it. Callbacks after it was closed are ignored. */
  openStream(handlers: StreamHandlers<C>): () => void;
  /** Fetches the list and puts it on the screen. A rejection is the caller's to show; the feed carries on. */
  refreshList(): Promise<void>;
  applyChange(change: C): void;
  onMode(mode: Mode): void;
  /** An error after which retrying cannot help (the login is over, the login is not a vendor's). The feed has stopped when this is called. */
  isFatal(error: unknown): boolean;
  onFatal(error: unknown): void;
  pollMs?: number;
  pollLiveMs?: number;
  idleMs?: number;
  watchdogMs?: number;
  /** A stream that lived at least this long counts as healthy: its end is followed by an immediate reconnect, and resets the retry delay. */
  healthyMs?: number;
  now?: () => number;
  random?: () => number;
}

export const POLL_MS = 7000;
export const POLL_LIVE_MS = 60_000;
export const STREAM_IDLE_MS = 45_000;

/** The wait before retry number `attempt` (1, 2, 3, ...): 1, 2, 4, 8, 16, 30 seconds and then 30, each spread by up to 20% either way. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

export class LiveFeed<C> {
  private readonly o: Required<
    Pick<LiveFeedOptions<C>, 'pollMs' | 'pollLiveMs' | 'idleMs' | 'watchdogMs' | 'healthyMs' | 'now' | 'random'>
  > &
    LiveFeedOptions<C>;
  private mode: Mode = 'connecting';
  private stopped = true;
  private generation = 0;
  private closeStream: (() => void) | undefined;
  private openedAt: number | undefined;
  private lastActivity = 0;
  private attempt = 0;
  private listing = 0;
  private held: C[] = [];
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;

  constructor(options: LiveFeedOptions<C>) {
    this.o = {
      pollMs: POLL_MS,
      pollLiveMs: POLL_LIVE_MS,
      idleMs: STREAM_IDLE_MS,
      watchdogMs: 5000,
      healthyMs: 5000,
      now: Date.now,
      random: Math.random,
      ...options,
    };
  }

  get currentMode(): Mode {
    return this.mode;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedulePoll();
    void this.refresh(); // the screen has a list at once, whatever the stream does
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    this.closeCurrent();
    clearTimeout(this.pollTimer);
    clearTimeout(this.retryTimer);
  }

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.o.onMode(mode);
    this.schedulePoll(); // the interval depends on the mode
  }

  private connect(): void {
    if (this.stopped) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation && !this.stopped;
    this.openedAt = undefined;
    this.closeStream = this.o.openStream({
      onOpen: () => {
        if (!current()) return;
        this.openedAt = this.o.now();
        this.lastActivity = this.openedAt;
        this.watchdog = setInterval(() => this.checkAlive(), this.o.watchdogMs);
        this.setMode('live');
        void this.refresh(); // after the stream is open, so a change in between is on the stream or in the list
      },
      onActivity: () => {
        if (current()) this.lastActivity = this.o.now();
      },
      onChange: (change) => {
        if (!current()) return;
        this.lastActivity = this.o.now();
        if (this.listing > 0) this.held.push(change);
        else this.o.applyChange(change);
      },
      onComplete: () => {
        if (current()) this.ended();
      },
      onError: (error) => {
        if (current()) this.failed(error);
      },
    });
  }

  private closeCurrent(): void {
    clearInterval(this.watchdog);
    this.watchdog = undefined;
    const close = this.closeStream;
    this.closeStream = undefined;
    close?.();
  }

  private lifeMs(): number {
    return this.openedAt === undefined ? 0 : this.o.now() - this.openedAt;
  }

  private checkAlive(): void {
    if (this.stopped || this.openedAt === undefined) return;
    if (this.o.now() - this.lastActivity > this.o.idleMs) this.failed(new Error('the stream went silent'));
  }

  /** The server ended the stream. After a healthy life that is routine (the token expired): connect again at once. */
  private ended(): void {
    const healthy = this.lifeMs() >= this.o.healthyMs;
    this.generation++;
    this.closeCurrent();
    if (healthy) {
      this.attempt = 0;
      this.setMode('connecting');
      this.retryTimer = setTimeout(() => this.connect(), 0);
    } else {
      this.retryLater();
    }
  }

  private failed(error: unknown): void {
    if (this.o.isFatal(error)) {
      this.stop();
      this.o.onFatal(error);
      return;
    }
    if (this.lifeMs() >= this.o.healthyMs) this.attempt = 0;
    this.generation++;
    this.closeCurrent();
    this.retryLater();
  }

  private retryLater(): void {
    this.attempt++;
    this.setMode('polling');
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), backoffMs(this.attempt, this.o.random));
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    clearTimeout(this.pollTimer);
    const interval = this.mode === 'live' ? this.o.pollLiveMs : this.o.pollMs;
    // The next poll is set before this one is asked, so the cadence does not depend on how long the answer takes.
    this.pollTimer = setTimeout(() => {
      this.schedulePoll();
      void this.refresh();
    }, interval);
  }

  /** Fetches the list. Changes that arrive meanwhile are held and applied after it, so the list never overwrites a newer change. */
  private async refresh(): Promise<void> {
    if (this.listing > 0) return; // one is already on its way
    this.listing++;
    try {
      await this.o.refreshList();
    } catch {
      /* the caller shows the failure; the next poll asks again */
    } finally {
      this.listing--;
      const held = this.held;
      this.held = [];
      if (!this.stopped) for (const change of held) this.o.applyChange(change);
    }
  }
}
