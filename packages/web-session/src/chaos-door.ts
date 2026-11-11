import type http from 'node:http';
import {
  chaosFromEnv,
  indicatorHeaders,
  requestFaults,
  runDoor,
  runInRequestScope,
  type ChaosRuntime,
} from '@bakery/chaos';
import type { ApiRequest, ApiResponse } from './handlers.ts';

// Chaos scenarios for the web servers (ADR-0024): the `web` layer is a gate at the head of the two GraphQL routes, before the rate limits, the CSRF checks
// and the session are looked at. It can wait, answer a chosen error status, answer a non-JSON body, reset the connection, or never answer, as the BFF's own
// door does (the shared code is `runDoor` in @bakery/chaos). It is only there when CHAOS_ENABLED is set and the process is allowed to run chaos
// (DEPLOYMENT_ENVIRONMENT local or dev, or NODE_ENV development or test); otherwise nothing is built and no request is touched.

/** True when the request was answered (or deliberately left unanswered) and the handler must stop. */
export type RequestGate = (req: ApiRequest, res: ApiResponse) => Promise<boolean>;

const SAFE_MESSAGE = 'The service is temporarily unavailable. Please try again.';

export function webChaosGate(runtime: ChaosRuntime | undefined): RequestGate | undefined {
  if (!runtime) return undefined;
  const door = runtime.layer('web');
  if (!door.declared) return undefined;
  let seq = 0;
  return (req, res) =>
    runInRequestScope(undefined, async () => {
      // A caller that sets its own traceparent chooses the key, so a test can say which requests will be hit; otherwise it is the request's number.
      const traceId = /^00-([0-9a-f]{32})-/.exec(String(req.headers['traceparent'] ?? ''))?.[1];
      const key = traceId ?? `seq:${++seq}`;
      const indicator = () => {
        for (const [name, value] of Object.entries(indicatorHeaders(runtime, requestFaults())))
          res.setHeader(name, value);
      };
      return runDoor(
        door,
        req as unknown as Pick<http.IncomingMessage, 'socket'>,
        res as unknown as http.ServerResponse,
        key,
        {
          reject: (status) => {
            indicator();
            if (status === 429) res.setHeader('retry-after', '1');
            res.status(status);
            res.json({ error: SAFE_MESSAGE });
          },
          malformed: () => {
            indicator();
            res.status(200);
            res.setHeader('content-type', 'text/html');
            res.send(Buffer.from('<html><body>Bad gateway</body></html>'));
          },
        },
      );
    });
}

/** The gate for this process, from CHAOS_ENABLED and CHAOS_SCENARIO; undefined when chaos is off. A scenario that cannot be used stops the process at its first use. */
export function webChaosGateFromEnv(env: Record<string, string | undefined> = process.env): RequestGate | undefined {
  return webChaosGate(chaosFromEnv(env as NodeJS.ProcessEnv)); // Next.js types NODE_ENV as required, so the loose record is narrowed here
}
