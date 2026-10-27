# ADR: GraphQL BFF and Relay

-   **Status:** Proposed for adoption
-   **Decision:** Standalone Node.js/TypeScript GraphQL BFF; Relay web
    client; C# services remain domain authorities.

The BFF owns client-facing GraphQL schema, resolver composition,
downstream API clients, and stable client-safe error mapping---not
domain rules, persistence, pricing, or order state. Relay owns client
query/fragment composition, generated types, normalized client store,
refetching, and pagination where useful. Avoid a competing
Apollo/query-cache system.

C# services own business rules, persistence, pricing, availability,
order transitions, and authoritative validation. Mutations define
idempotency/retry behavior. Avoid uncontrolled resolver N+1 calls; batch
when justified and tested. Never share authorization-sensitive cache
data across identities.

Consequences: second runtime/language; schema generation and downstream
contract tests; local startup/telemetry include BFF. Validate SSR query
through BFF to one C# API, error mapping, and request isolation.
