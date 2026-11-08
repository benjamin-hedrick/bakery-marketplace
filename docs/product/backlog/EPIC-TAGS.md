> **Status:** 0 of 5 items done (TAG-001 In review, TAG-002, TAG-003 and TAG-004 In review, TAG-005 Deferred)

```
Epic ID:            EPIC-TAGS
Title:               Tags (context on listings and options: allergens, diet, occasion, season, theme)
Scope:               Catalog & Customization (the registry and the assignment), Search & Discovery (filtering), Preferences & Dietary Safety (the allergen list and, later, diet preferences)
Primary hat(s):      Engineering/Build, Architect
Goal:                One mechanism for context on listings and customizations. The first use is the closed allergen list that personalization and the order record depend on; the rest (diet, holiday, themed, seasonal, hidden platform signals) is added in phases on the same registry.
Related references:  ADR-0022 (docs/architecture/adr/0022-tags.md), ADR-0004, ADR-0009, ADR-0014, NFR 3.7
Constituent work items:
  - WI-TAG-001 (Service Implementation — the tag registry and the closed allergen list)
  - WI-TAG-002 (Service Implementation — tags on listings and options, vendor assignment, visibility)
  - WI-TAG-003 (Service Implementation — filter the public browse by tag)
  - WI-TAG-004 (Service Implementation — diet tags in the customer's profile)
  - WI-TAG-005 (Service Implementation — seasonal and themed surfaces, administrator editing) — Deferred
Status:              0 of 5 items done (TAG-001 In review, TAG-002, TAG-003 and TAG-004 In review, TAG-005 Deferred)
```

> **Added 2026-11-04** after the lead asked for a general mechanism instead of dietary preferences alone ("design for the general use and implement iteratively"). The personalization items (`PREF-001`, `SRCH-001`, `CUST-005`, `CUST-006`, `CUST-008`, `ORD-009`, `QUE-005`) depend on `TAG-001` only.
