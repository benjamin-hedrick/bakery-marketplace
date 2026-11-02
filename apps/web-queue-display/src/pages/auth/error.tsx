import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { loginMessage } from '@bakery/web-session/messages';

/** Where a failed login lands (the server redirects here with a code). Shows a fixed sentence for the code, never anything the issuer said. */
export default function LoginError() {
  const router = useRouter();
  return (
    <main>
      <Head>
        <title>Login failed</title>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <section role="alert" data-testid="login-error">
        <p>{router.isReady ? loginMessage(router.query['code']) : 'The login was not completed.'}</p>
        <Link href="/">Back to the queue</Link>
      </section>
    </main>
  );
}
