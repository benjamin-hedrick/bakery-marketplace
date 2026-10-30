# C4 Diagrams

- `context.md` — System context: customers, shops, vendors, admins, and the platform boundary.
- `container.md` — Containers: what runs locally today, and the target shape from the ADRs (none deployed).
- `component-services.md` — Components of `ordering-service` and `catalog-service` (the two services with code).
- `../request-path.md` — Sequence diagrams of login, a public page load, and placing and reading an order, with the trace and what each hop carries.
- `component-*.md` — Component-level detail for key services (start with ordering-service and catalog-service).

Diagrams can be authored as Mermaid blocks directly in these files so they render in both GitHub and the published docs site.
