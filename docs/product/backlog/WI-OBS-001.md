> **Status:** In progress · steps 1 to 3 built locally on 2026-11-22 at the lead's go (nothing applied to Azure); steps 4 to 7 remain. The design is ADR-0016's (collector to Application Insights).

> **Progress note (2026-11-22):** steps 1 to 3 are built on `feature/dev-chaos-evidence`, checked offline only (`terraform-checks.mjs`: validate and the mocked-provider tests, 2 new runs; the unit tests of the two scripts; the collector config run in Docker with the config passed in an environment variable, which answered 200 to a span and 404 to metrics). **Not proved: that any of it works in Azure.** What changed from the proposal above, for the lead to confirm: (1) **no image of our own**: Terraform runs the public `otel/opentelemetry-collector-contrib:0.164.0` (variable `otel_collector_version`, the version `docker-compose.yml` pins) and passes `infra/otel-collector/cloud.yaml` in the environment variable `OTEL_COLLECTOR_CONFIG` (`--config=env:...`), so the image pipeline, the push record and the deploy stage's digest rules are untouched; (2) the connection string follows the secrets rule (never in the state): a fourth Key Vault placeholder secret, set after apply by `dev-secrets.mjs` from the Application Insights resource (skipped when the stack has no tracing), and because a revision reads its secrets only when it starts, `dev-deploy.mjs` gives the collector a new revision after the secrets step and before the apps; (3) **no pipeline input yet**: the module's `tracing` is off by default, the dev root turns it on (`var.tracing`, default true), so the next dev create has tracing and a run cannot yet leave it out; (4) the C# services need `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` as well as the endpoint (register 36; the Terraform sets both). Known and left alone: with an endpoint set the C# services also try to send metrics, which the collector's traces-only pipeline answers 404 (the exporter logs it); `Microsoft.Insights` is registered on the subscription (checked 2026-11-22 with `az provider show`; the runbook's provider list does not name it, so a new subscription would need it added there); the deploy identity needs no new role (Contributor on the group creates the resource and reads its connection string), but this is also unproved.

```
WI ID:               OBS-001
Title:                Traces in deployed DEV: an OpenTelemetry collector to Application Insights, and the chaos scenarios' spans in the evidence
Type:                 Service Implementation
Epic:                 EPIC-OBSERVABILITY
Shared with epic(s):  EPIC-CLOUD-INFRA
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 M
```

> Written 2026-11-22 after the first deployed `dev-chaos` run (build 117, `docs/evidence/WI-CHAOS-006/dev-chaos-deployed-2026-11-22.md`). It narrows the epic catalog's `OBS-001` ("Application Insights wiring per service") to what DEV needs. The catalog line is adjusted to point here.

**Context / Why**

Deployed DEV has logs and no traces. The environment module creates a Log Analytics workspace (30 days) that holds the apps' console output, and the observe stage reads it: in build 117 all 40 of the smoke's trace ids were found there. But no app exports spans. The C# services export OTLP only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`TelemetryExtensions`), and so do the BFF (`services/graphql-bff/src/otlp.ts`) and the web app's server (`apps/web-customer/src/lib/relay/otlp.ts`); nothing sets it in DEV, and there is no Application Insights resource and no collector. So for a chaos request (a lost payment, a rejected stock check, a slow BFF) we can find its log lines by trace id but cannot see its path across web, BFF, catalog and ordering, or where the time went. The owner wants those traces, especially of the chaos scenarios.

**Design (already decided, ADR-0016 and its 2026-10-28 amendment)**

Cloud services send OTLP to a collector; the collector's `azuremonitor` exporter sends to Application Insights. The connection string lives in one place (ADR-0007, Key Vault) and a central processor drops `url.query` and `http.url` before data leaves. The template is `infra/otel-collector/cloud.yaml`, "not deployed and not run against Azure yet". Jaeger is an opt-in extra for UAT and Prod, not DEV. The collector is therefore the specification for DEV; a direct export from each app is not.

**What is not decided (the lead chooses)**

1. **Who hosts the collector.** The ADR leaves it open ("for example a Container Apps container"). Proposed: one more Container App in DEV's environment, internal ingress only, OTLP/HTTP on 4318. It must be `min_replicas = 1`: scaled to zero it would drop spans while it woke, the same reason the events and sessions Redis apps stay up. That is one more always-on app (small cost; not in `budget-cost-estimate.md`, to be added). It counts toward the subscription's single Container Apps environment, not a second one.
2. **Whether the collector image is built here** (the contrib distribution with the `azuremonitor` exporter, config baked in like the chaos scenario files, pushed with the other images) or taken as a public image with the config mounted. Proposed: build it with the other images so the pipeline's digest and "no credentials on the agent" rules stay the same.
3. **Whether a failed export may fail a request.** Proposed: never; the apps' export is already best effort, and the collector being down must not affect the suite.
4. **Sampling.** Proposed: keep everything in DEV (the volume is a smoke run's), and say so in the evidence; revisit for UAT and Prod.

**Steps, in order (each small, each a commit)**

1. **Terraform:** an Application Insights resource on the existing workspace (workspace-based), its connection string a Key Vault secret like the others; the collector Container App, internal, `min_replicas = 1`, its secret by reference. A variable `tracing` (default on in DEV) so a run can leave it out, as `cacheRedis` can be left out.
2. **Collector image and config:** `infra/otel-collector/cloud.yaml` made real (the connection string from the environment, the safety processor, the batch processor), validated with `otelcol-contrib validate` as `local.yaml` is. Checked 2026-11-22 against `otel/opentelemetry-collector-contrib:0.164.0` (the version `docker-compose.yml` pins): `otelcol-contrib components` lists the exporter `azure_monitor` (module `exporter/azuremonitorexporter` v0.164.1), stability **Beta for traces, metrics and logs**; `validate` accepts `cloud.yaml` with a dummy connection string, and also accepts the old spelling `azuremonitor` (it is listed as a valid type beside `azure_monitor`, so it is an alias), while a made-up name is refused, so the check is real. Change the config to `azure_monitor` so it does not depend on an alias. What validation does not show is that spans arrive in Application Insights with a real connection string: that is first proved by step 6's run, and the evidence says it was not proved before.
3. **Wire the apps:** set `OTEL_EXPORTER_OTLP_ENDPOINT` on web, graphql-bff, catalog and ordering (the notification service is not deployed). No code change is expected: the C# `AddBakeryTelemetry` and the two Node exporters already read it. Verify the resource names (`service.name`) tell the four apps apart.
4. **Identity:** the read-only observe identity gets read on Application Insights (Monitoring Reader or Log Analytics Reader on the workspace, whichever the query needs). The register's identity and role checks (`identity-check.mjs`, item 231) change with it, so this step needs the lead's approval as an IAM change.
5. **Observe stage:** `scripts/ci/dev-observe.mjs` queries Application Insights for the smoke's trace ids and writes, per chaos test, whether a trace exists and its spans (the app, the operation, the duration, the status). Counts and ids only, as the stage does today: no query text, no headers, no bodies.
6. **Evidence:** a deployed `dev-chaos` run with tracing on, recorded in `docs/evidence/WI-OBS-001/`: for each of the four chaos scenarios, one trace across the four apps showing where the fault was injected (the lost payment in ordering, the rejected stock check between ordering and catalog, the slow BFF), and a plain order's trace beside it. Screenshots of the portal are not needed; the span list from the query is.
7. **Docs:** `docs/operations/monitoring-alerting.md` and `docs/operations/runbooks/dev-environment-teardown.md` (App Insights and the collector are torn down with the environment; the workspace is already), the ADR-0016 table (DEV: built), `budget-cost-estimate.md`.

**Out of scope**

- Dashboards and alerts (`OBS-003`, which implements `OPS-003`'s thresholds).
- UAT and Prod (parked, register 235), and Jaeger.
- Adopting the OpenTelemetry Node SDK in the BFF and web app (register item 36); the existing best-effort exporters are used as they are.
- Metrics and logs export; the console-log path stays as it is.
- Any change to the chaos layer or the suite.

**Requirements / Acceptance Criteria**

- A deployed DEV run with `dev-chaos` leaves, in Application Insights, a trace for each of the smoke's trace ids that crossed the apps, and the observe stage's evidence lists them with their spans.
- The trace of a chaos request shows the app and the span where the fault was injected, with the span's error status where the system reports one.
- No query string, URL with a query, header, cookie, token or request body reaches Application Insights (the safety processor, tested with a request that carries one).
- With the collector stopped, the deployed suite still passes.
- The connection string appears in no file, log, plan summary or pipeline output (ADR-0007).
- A DEV create from empty and a teardown still work, and the teardown leaves nothing of the tracing behind.

**Dependencies**

`WI-PORT-005` (Done: W3C trace context across the apps), `WI-CHAOS-006` (the chaos scenarios the traces are for), `WI-DEP-001` (the DEV environment and its pipeline), ADR-0016, ADR-0007. Needs the lead's approval for step 4 (roles) and for the Azure resources in step 1 before they are applied.

**Inputs / References**

`docs/architecture/adr/0016-opentelemetry-tracing.md` (decisions 5 and 6 and the collector amendment), `infra/otel-collector/`, `tools/BakeryMarketplace.Logging/TelemetryExtensions.cs`, `scripts/ci/dev-observe.mjs`, `docs/evidence/WI-CHAOS-006/dev-chaos-deployed-2026-11-22.md`.
