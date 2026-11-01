import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { finishLogin } from '../../lib/auth/browser.ts';
import { LoginError } from '../../lib/auth/login.ts';

/** Where the issuer sends the browser back to. Client-rendered: the code is exchanged here and the token never reaches our server. */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!router.isReady || started.current) return;
    started.current = true; // the login is spent by the first attempt, so a second run (React strict mode) must not start another
    finishLogin(new URLSearchParams(window.location.search))
      .then(({ returnTo }) => router.replace(returnTo))
      .catch((e: unknown) =>
        setError(e instanceof LoginError ? e.message : 'We could not complete the login. Please try again.'),
      );
  }, [router]);

  return (
    <main>
      <Head>
        <title>Logging in</title>
        <meta name="referrer" content="no-referrer" />
      </Head>
      {error ? (
        <section role="alert" data-testid="login-error">
          <p>{error}</p>
          <Link href="/">Back to the queue</Link>
        </section>
      ) : (
        <p>Signing you in…</p>
      )}
    </main>
  );
}
