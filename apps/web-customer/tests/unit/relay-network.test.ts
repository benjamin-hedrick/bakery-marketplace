// ADR-0024, WI-CHAOS-005: the customer app's browser network function against the equivalence contract shared by both web apps (the contract and what
// it checks: packages/web-session/tests/relay-network-contract.ts). The Android app's equivalent is apps/mobile-customer/tests/chaos-outcomes.test.ts.
import { runRelayNetworkContract } from '../../../../packages/web-session/tests/relay-network-contract.ts';
import { browserFetch, GRAPHQL_TIMEOUT_MS } from '../../src/lib/relay/environment.ts';

runRelayNetworkContract('the customer app', browserFetch, GRAPHQL_TIMEOUT_MS);
