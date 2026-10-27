import { useEffect, useMemo } from 'react';
import { RecordSource } from 'relay-runtime';
import type { Environment } from 'relay-runtime';
import { createRenderEnvironment, getBrowserEnvironment } from './environment';
import type { RelayRecords } from './environment';

/**
 * Server: a fresh, network-less environment built from this request's records.
 * Browser: the session's single environment, with the server-fetched records merged in. The merge is
 * idempotent, so hydration and client navigation (which re-runs getServerSideProps) both land correctly.
 */
export function useHydratedEnvironment(records: RelayRecords | undefined): Environment {
  const environment = useMemo(() => {
    if (typeof window === 'undefined') return createRenderEnvironment(records);
    const env = getBrowserEnvironment();
    if (records) env.getStore().publish(new RecordSource(records));
    return env;
  }, [records]);

  useEffect(() => {
    if (typeof window !== 'undefined') environment.getStore().notify();
  }, [environment, records]);

  return environment;
}
