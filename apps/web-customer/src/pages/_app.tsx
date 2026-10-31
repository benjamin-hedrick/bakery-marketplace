import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { RelayEnvironmentProvider } from 'react-relay';
import { SiteHeader } from '../components/SiteHeader.tsx';
import type { RelayRecords } from '../lib/relay/environment';
import { useHydratedEnvironment } from '../lib/relay/useHydratedEnvironment';

type PageProps = { relayRecords?: RelayRecords } & Record<string, unknown>;

export default function App({ Component, pageProps }: AppProps<PageProps>) {
  const { relayRecords, ...rest } = pageProps;
  const environment = useHydratedEnvironment(relayRecords);
  return (
    <RelayEnvironmentProvider environment={environment}>
      <SiteHeader />
      <Component {...rest} />
    </RelayEnvironmentProvider>
  );
}
