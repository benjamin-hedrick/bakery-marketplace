import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { SiteHeader } from '../components/SiteHeader.tsx';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <SiteHeader />
      <Component {...pageProps} />
    </>
  );
}
