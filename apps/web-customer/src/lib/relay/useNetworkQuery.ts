import { useCallback, useEffect, useState } from 'react';
import { useRelayEnvironment } from 'react-relay';
import { fetchQuery, type GraphQLTaggedNode, type OperationType } from 'relay-runtime';
import type { Part } from '@bakery/customer-core';

/**
 * Reads a query from the network every time, never from Relay's store, for answers a stored copy could make wrong (open pickup times, the
 * signed-in customer's payment methods). With `variables` null nothing is asked and the answer stays loading. A newer request, a retry or
 * leaving the page unsubscribes from the older one, so a late answer never lands on a page that has moved on.
 *
 * `variables` are compared by their JSON, so an object built on every render does not ask again. The second value asks again (a "Try
 * again" button); the answer is loading until the new one arrives.
 */
export function useNetworkQuery<Q extends OperationType>(
  query: GraphQLTaggedNode,
  variables: Q['variables'] | null,
): [Part<Q['response']>, () => void] {
  const environment = useRelayEnvironment();
  const [answer, setAnswer] = useState<{ key: string; part: Part<Q['response']> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const variablesKey = variables === null ? null : JSON.stringify(variables);
  const key = `${variablesKey}#${attempt}`;

  useEffect(() => {
    if (variablesKey === null) return;
    const subscription = fetchQuery<Q>(environment, query, JSON.parse(variablesKey) as Q['variables'], {
      fetchPolicy: 'network-only',
    }).subscribe({
      next: (data) => setAnswer({ key, part: { state: 'ready', value: data } }),
      error: () => setAnswer({ key, part: { state: 'failed' } }),
    });
    return () => subscription.unsubscribe();
  }, [environment, query, variablesKey, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // An answer for other variables or an earlier attempt is not this one's: until the new one arrives it is loading.
  return [answer?.key === key ? answer.part : { state: 'loading' }, retry];
}
