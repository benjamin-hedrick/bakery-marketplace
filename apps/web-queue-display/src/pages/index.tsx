import Head from 'next/head';
import { QueueBoard } from '../components/QueueBoard.tsx';
import { RequireLogin } from '../components/RequireLogin.tsx';

/** The queue display. Client-rendered: there is nothing public to render on the server, and a vendor's orders must never be. */
export default function Home() {
  return (
    <>
      <Head>
        <title>Order queue</title>
      </Head>
      <RequireLogin>
        <QueueBoard />
      </RequireLogin>
    </>
  );
}
