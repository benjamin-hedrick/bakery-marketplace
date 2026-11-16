# admin-service

**A placeholder for a later phase.** It is stubbed in so the service layout of ADR-0009 (thirteen bounded contexts on four services) is visible, but it has no features: `Program.cs` starts the host with a health endpoint, correlation ids and the chaos gate, and nothing else.

What it will hold, when its phase comes: the vendor verification queue, listing moderation and basic analytics (the Admin/Moderation and Vendor Onboarding contexts). The planned work is in `docs/product/backlog/epic-catalog.md` (`EPIC-VENDOR-ONBOARDING` and the admin items); vendor onboarding (`VEN-001`, `VEN-002`) comes after the vendor's listing and stock screens in the [current plan](../../docs/product/backlog/current-plan.md).
