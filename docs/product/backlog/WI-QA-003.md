> **Status:** Deferred · trigger: the lead decides to run the experiments

> **Mobile spike (2026-11-04, row T-35 decided; the AI-assisted testing experiment, T-34, stays deferred):** Maestro 2.12.1 was installed locally (JDK 17, Android SDK, an `android-35` Pixel 7 emulator; WHPX acceleration works on this Windows 11 Home machine). **Run:** one Maestro web flow (open the customer app, log in, the user name shows) **passed** against the real web app on the mock BFF and fake issuer; Maestro marks web support as Beta. The emulator booted in about 85 s and `adb` sees it. **Update 2026-11-04, `WI-MOB-001`:** four Maestro flows against the Expo app on the emulator **passed** (login, restart without login, logout, browse, order journey, declined payment), run by `node scripts/dev/mobile-flows.mjs`; record in `docs/evidence/WI-MOB-001/`. Still not run: iOS, real devices, other images, the pipeline. **Decision (the lead):** build a thin Expo client, Android only, local only, with login, browse, cart, checkout and order status, tested with Maestro flows (`WI-MOB-001`, sign-in in ADR-0023). Maestro runs only locally, not in the Azure pipeline. Maestro's cloud (paid) is not used. Playwright stays the tool for the web apps.

```
WI ID:               QA-003
Title:                Planned experiments: AI-assisted testing and the mobile question
Type:                 Document/Artifact
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Deferred
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The October plan names an AI-assisted testing experiment (a stable bounded requirement set, tests proposed under a task contract and human-reviewed, with accepted cases, duplicates, false assumptions, defects caught and review cost recorded against a baseline) that was never run, and treats mobile testing as a future path. Verify the current web support of the mobile test tool before deciding; otherwise record the decision.

**Inputs / References**
- *Gap catalog rows*: `T-34`, `T-35`, `G-E10`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/management/portfolio-slice/02-vertical-slice-and-quality.md` and `05`
- *References*: `docs/method/ai-collaboration.md` ("What is measured and what is not")

**You do not need to know about**
- Anything outside the rows named above.

**Out of scope**
- Scheduling and delegation; any other gap.

**Requirements / Acceptance Criteria**
- Every row named above has State Done (or Dropped, with the reason) in the gap catalog, pointing at what was produced.
- Anything found while doing it and not fixed is recorded in the register in the same change.

**Dependencies**
- Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Partial; the protocol and its review are the lead's.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
