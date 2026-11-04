> **Status:** Ready

```
WI ID:               TAG-001
Title:                The tag registry and the closed allergen list
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-PREFERENCES (the allergen list is what the profile and the order record refer to)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
Allergen flags are free text today (`tree-nut` in the seed; a customer will type "tree nuts"), so nothing can match them reliably. ADR-0022 puts every tag in one catalog-owned registry whose entries have a stable id and a kind, and makes the allergen kind a closed list. This item builds the registry and applies the closed list to the flags that already exist. It changes no listing shape.

**Inputs / References**
- *Decisions*: ADR-0022 (the registry, the kinds, visibility, ids), ADR-0009 (catalog hosts it), ADR-0014 (public responses are cacheable), ADR-0013 (the BFF only maps), NFR 3.7.
- *Interfaces*: the listing validator and `ListingService` (`ListingValidator.NormalizeFlags`), the BFF schema.
- *Existing values*: the seed uses `gluten`, `dairy`, `egg`, `tree-nut` and `sesame`; the list below keeps those ids so the seed needs no change.

**You do not need to know about**
- Tags on listings or options other than allergens (`TAG-002`), filtering (`TAG-003`), a customer's profile (`PREF-001`).

**Out of scope**
- The `tags` field on listings and options; hidden tags and windows being applied to listings (the registry carries the fields, nothing assigns them yet); administrator editing; a database container for the registry.

**Requirements / Acceptance Criteria**
- **The registry** is a data file embedded in the catalog service, read through `ITagRegistry`. An entry has `id`, `kind`, `label`, `visibility` (`public` | `hidden`), `assignableBy` (`vendor` | `platform`), optional `activeFrom` and `activeTo` (UTC dates), optional `sortOrder`, and a `retired` flag. The file is validated when the service starts, and a bad file stops the start with a message naming the entry: ids are unique across all kinds and match `[a-z0-9-]{1,40}`; the kind is one of the closed set in code (`allergen`, `diet`, `occasion`, `season`, `theme`); `activeFrom` is not after `activeTo`; a `hidden` tag is `assignableBy: platform`.
- **The allergen entries** (kind `allergen`, public, vendor-assignable): `dairy`, `egg`, `fish`, `shellfish`, `tree-nut`, `peanut`, `gluten`, `soy`, `sesame`, with customer-facing labels (for example "Tree nuts", "Gluten (wheat, rye, barley)").
- **`GET /catalog/tags`** is anonymous and returns the public tags that are active now (id, kind, label, sort order), optionally narrowed by `kind`. It carries the same cache headers as the public listing endpoints. Hidden tags, retired tags and tags outside their window are absent.
- **Closed list on listings.** On create and update, every value in `allergenFlags` and in each option's `allergens` (after the existing trim and lower-case) must be an allergen id in the registry, else 422 `validation_failed` naming the field and the value and listing the allowed ids. Reads never reject: a stored listing with an old value is returned as it is, and its next update must correct it.
- **BFF:** `tags(kind: TagKind): [Tag!]!` (public; `Tag { id label kind }`), mapped from the catalog with no rules of its own; the schema file is the contract.
- **Docs:** `data-model-api-contracts.md` and the glossary gain the registry, the kinds and `GET /catalog/tags`; ADR-0022's status is the lead's to move to Accepted.
- **Tests:** registry validation (every bad-file case above); the endpoint (hidden, retired and out-of-window tags absent, with a fake clock; kind filter; anonymous); listing create and update accepting each allergen id and refusing `tree-nuts` and `nuts`, and accepting `Tree-Nut ` as `tree-nut` (the existing trim and lower-case still apply); option allergens refused the same way; a stored listing with an old value still readable; BFF mapping tests. The seed loads without a validation error.

**Dependencies**
- Blocks: `TAG-002`, `PREF-001`, `SRCH-001`, `CUST-005`, `ORD-009`.
- Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific: the vendor API's changed contract (a closed list) is stated in the contract document.

**AI-agent suitability**
Yes for the registry, the endpoint, the validation and the mapping. The list of nine allergens and their labels are the lead's to confirm.

**Open Points (working)**
- [ ] The nine allergens and their labels (US "big 9" with `gluten` for wheat so the seed's ids stay). Confirm, or add the EU list's mustard, celery, lupin, molluscs and sulphites now.
