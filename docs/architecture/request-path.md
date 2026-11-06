# Request path

> **Status:** Current · written 2026-10-30 from `first-slice-contract.md`, the ordering and catalog code and outcome notes, and the captured trace in `docs/evidence/slice-1/findings.md`. Describes the local stack; nothing is deployed. The containers are in [the container diagram](c4/container.md).

Three paths cover slice 1: logging in, loading a public page, and placing and reading an order. Timings come from the one capture on a developer machine; they are measurements, not budgets.

## 1. Logging in (Authorization Code with PKCE)

The browser logs in on its own, and the access token lives in browser memory only (ADR-0006; a reload logs the user out, register item 24).

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant W as Web app server (/api/auth/*)
    participant O as Mock OIDC issuer
    participant R as Redis (session store)
    B->>W: GET /api/auth/login?returnTo=/path
    W->>R: pending login (state, PKCE verifier), 10 minutes
    W-->>B: 302 to the issuer (challenge, state, registered redirect_uri) + short-lived cookie with the pending id
    B->>O: GET /authorize
    O-->>B: login page (mock users), then 302 to /api/auth/callback?code&state
    B->>W: GET /api/auth/callback?code&state (pending cookie)
    W->>R: take the pending login (once)
    W->>O: POST /token (code, verifier, no secret)
    O-->>W: access token (signed JWT, roles in `roles`) and a refresh token
    W->>R: session = tokens, encrypted (AES-256-GCM)
    W-->>B: 302 to returnTo + HttpOnly session cookie (an opaque id)
    Note over B,W: the page holds no token; GraphQL calls carry the cookie,<br/>and the server adds Authorization: Bearer for the BFF
```

## 2. Loading a public page (no token)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant W as Next.js server
    participant G as GraphQL BFF
    participant C as catalog-service
    participant D as Cosmos (catalog)
    B->>W: GET /listings/{id}
    W->>G: POST /graphql (listing query, traceparent)
    G->>C: GET /catalog/listings/{id} (traceparent)
    C->>D: read listing, check vendor status
    D-->>C: documents
    C-->>G: Listing (Published only, stock as a status word and a per-order limit)
    G-->>W: GraphQL data, Relay global ids
    W-->>B: HTML (server-rendered)
```

One trace covers the web server, the BFF and the catalog. The page-render span does not exist, and the browser hop is untraced (register 42, 82).

## 3. Placing an order and reading it back

`placeOrder` is a single downstream call: the BFF does not compose multi-step writes. All rules (price, stock, pickup window, idempotency) live in `ordering-service`.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (checkout page)
    participant W as Next.js /api/graphql route
    participant G as GraphQL BFF
    participant O as ordering-service
    participant I as Mock OIDC issuer
    participant C as catalog-service
    participant S as Cosmos (orders)
    participant R as Redis Streams

    B->>W: placeOrder(lines, window?, idempotencyKey) with Authorization
    W->>G: forwarded unchanged
    G->>O: POST /ordering/checkout (token, Idempotency-Key header, traceparent)
    O->>I: signing keys (first use: metadata fetch, about 2 s cold)
    O->>O: validate JWT, Customer role, customerId from the token
    O->>S: is there already an order for (customer, key)?
    alt repeat of the same checkout
        S-->>O: yes
        O-->>G: 200 with the original order, nothing touched
    else new checkout
        O->>C: GET listing for each distinct item (price and option check, now)
        O->>O: price in integer cents, check quantity limits, check the pickup window against the schedule
        O->>I: service token (client credentials, first use about 2 s cold)
        O->>C: POST /catalog/stock/reservations (atomic, per vendor, keyed by the order id)
        alt not enough stock
            C-->>O: 409 with the quantity left per line
            O-->>G: insufficient_stock
        else reserved
            O->>O: payment step: the saved method's token is validated by ordering, then a named stub authorizes
            alt payment declined
                O->>C: release the reservation
                O-->>G: 402 payment_declined
            else approved
                O->>S: create the order and its events in one write (outbox)
                O->>R: publish OrderPlaced (and OrderConfirmed when it confirms itself)
                O->>S: clear the outbox entries that were published
                O-->>G: 201 order (Placed, or Confirmed for a plain order)
            end
        end
    end
    G-->>W: PlaceOrderSuccess, or PlaceOrderRejected with a typed code
    W-->>B: result, the page goes to /orders/{id}
    B->>G: order(id) (token)
    G->>O: GET /ordering/orders/{id}
    O-->>G: order for the owner, 404 for anyone else
```

**What the order does next.** A plain order (no option on any line, no requested window) confirms itself in the same write that places it (`WI-ORD-008`); an order with an option or a requested window stays `Placed` until the bakery acts through the vendor endpoints (`WI-ORD-007`). A failed publish does not fail the checkout: the order is stored with its events, and `OutboxRelay` sweeps and sends any that were missed. Nothing reads the published events yet.

## What travels on each hop

| Hop | Token | `traceparent` | Idempotency key | Notes |
|---|---|---|---|---|
| Browser to Next.js `/api/graphql` | customer bearer | not sent (browser untraced) | in the `placeOrder` input | same origin, so no CORS for GraphQL |
| Next.js server to BFF (SSR) | none (public pages) | new trace | no | |
| BFF to services | customer bearer, forwarded unchanged | forwarded | sent as the `Idempotency-Key` header | services re-validate the token |
| `ordering-service` to `catalog-service` | the service's own client-credentials token | continued | no (the order id keys the reservation) | app role `Stock.Reserve` |
| Services to Cosmos and Redis | none | spans only | n/a | Cosmos calls show as client spans |

## What was measured

In the captured run (`docs/evidence/slice-1/findings.md`) one checkout was one trace across the BFF, ordering and catalog, and nine checkouts took 4675 ms (the first, on a cold stack) and then 55 to 78 ms. About 2 s of the first was fetching the issuer's metadata and about 2 s was fetching ordering's service token, both from a cold mock issuer; the BFF's checkout timeout is 15 s and ordering's own call timeout is 5 s. No token, key or secret appeared in any exported span. On 2026-10-30 the real-stack journeys that walk this path passed in each of 3 runs (`docs/evidence/baseline-2026-10-30.md`).
