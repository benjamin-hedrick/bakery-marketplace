import { createClient } from 'graphql-sse';
import { graphql } from 'react-relay';
import { getRequest } from 'relay-runtime';
import type { StreamHandlers } from './live-feed';
import { GraphQLRequestError, UnauthenticatedError } from './relay/environment';
import { markLoggedOut } from './session';
import type { QueueBoardSubscription$data } from '../__generated__/QueueBoardSubscription.graphql';

// The browser end of the live feed (ADR-0021): one `vendorOrderChanged` subscription over Server-Sent Events, through this app's own origin
// (/api/graphql-stream, which attaches the session's token on the server, ADR-0019). The page holds no token and sends none.

export type OrderChange = QueueBoardSubscription$data['vendorOrderChanged'];

// The same fields as the list query in QueueBoard.tsx: a pushed order replaces a listed one, so the two must carry the same data. (TypeScript
// checks it where the board applies a change to the list.) The Relay compiler checks the document against the schema.
const subscription = graphql`
  subscription QueueBoardSubscription {
    vendorOrderChanged {
      id
      reference
      status
      sequence
      itemCount
      automatic
      placedAt
      updatedAt
      pickupWindow {
        start
        end
      }
      pickupInstructions
      lines {
        listingId
        listingName
        quantity
        modifiers {
          id
          name
        }
      }
    }
  }
`;

const STREAM_URL = '/api/graphql-stream';

// The BFF writes this comment line the moment a subscription is established. Refusals also arrive as HTTP 200, with the error as the first event,
// so the status alone does not say the stream is up.
const READY = /(^|\n): ready\n/;

/**
 * Opens the subscription and reports it to the feed. Returns the function that closes it (which ends the request, and with it the call to
 * ordering-service). Every byte that arrives is reported as activity, comments included: the client library hides the heartbeat, which is exactly
 * what the feed needs to see to tell a quiet stream from a dead one.
 */
export function openVendorOrderStream(handlers: StreamHandlers<OrderChange>): () => void {
  let loginEnded = false;
  let ready = false;

  const observingFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    if (res.status === 401) {
      // No session behind the cookie, or the server has just ended it: the page offers the login.
      loginEnded = true;
      markLoggedOut();
    }
    if (!res.ok || !res.body) return res;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let head = '';
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        handlers.onActivity();
        if (!ready) {
          head += decoder.decode(value, { stream: true });
          if (READY.test(head)) {
            ready = true;
            handlers.onOpen();
          } else if (head.length > 4096) {
            head = head.slice(-64);
          }
        }
        controller.enqueue(value);
      },
      cancel: (reason) => reader.cancel(reason),
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };

  const client = createClient({ url: STREAM_URL, fetchFn: observingFetch, retryAttempts: 0 });
  const stop = client.subscribe<QueueBoardSubscription$data>(
    { query: getRequest(subscription).params.text ?? '' },
    {
      next(result) {
        if (result.errors?.length) {
          const entries = result.errors.map((e) => ({
            message: e.message,
            extensions: e.extensions as { code?: string; reference?: string } | undefined,
          }));
          const unauthenticated = entries.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
          if (unauthenticated) markLoggedOut();
          handlers.onError(unauthenticated ? new UnauthenticatedError() : new GraphQLRequestError(entries));
        } else if (result.data?.vendorOrderChanged) {
          handlers.onChange(result.data.vendorOrderChanged);
        }
      },
      error(error) {
        handlers.onError(loginEnded ? new UnauthenticatedError() : error);
      },
      complete() {
        handlers.onComplete();
      },
    },
  );
  return () => {
    stop();
    void client.dispose();
  };
}
