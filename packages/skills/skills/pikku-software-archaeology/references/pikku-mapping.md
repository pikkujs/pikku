# How Pikku Consumes a Product Blueprint

The `.knowledge/` blueprint is designed so each concept maps onto exactly one Pikku primitive. A generator (or an agent following `pikku-feature`) walks the JSON files in this order:

| Blueprint source | Pikku target |
|---|---|
| `entities.json` attributes + relationships + constraints | Kysely migrations + generated `DB` types; Zod schemas per entity |
| `entities.json` states/transitions | a `status` column + transition guards inside the owning commands (or a state-machine helper) |
| `commands.json` | `pikkuFunc` / `pikkuSessionlessFunc` with `input:` Zod schema built from `input[]`; `preconditions` become guard clauses; name is the camelCased command name (`SendInvoice` → `sendInvoice`) |
| `queries.json` | `pikkuFunc` reads; `scoping` becomes the mandatory `WHERE` / session filter |
| `events.json` | EventHub topics (realtime) or queue messages; `consumedBy` become `wireQueueWorker` handlers — implicit events (`explicit: false`) get promoted to real emissions |
| `policies.json` (authorization) | Pikku `permissions` / middleware; one policy = one named permission function, wired everywhere `enforcedAt` listed — this collapses duplicated legacy checks into a single definition |
| `policies.json` (validation) | Zod schema refinements on the command's `input` |
| `workflows.json` kind=user | frontend flows + the commands they chain |
| `workflows.json` kind=system, with `schedule` | `wireScheduler` entries |
| `workflows.json` multi-step / checkpointing | `pikkuWorkflowFunc` with one `workflow.do(...)` step per blueprint step |
| `workflows.json` `scenarios[]` | **`pikkuUserFlow` stories — this is the canonical target.** Each scenario's given/when/outcome maps 1:1 onto a user-flow step sequence; group scenarios by their workflow into one flow per journey. Only scenarios with no user-facing surface (pure system workflows: cron sweeps, webhook ingest) fall back to API/e2e tests |
| `api.json` | `wireHTTP` routes: keep `path`+`method` for compatibility, point at the mapped command/query func; `auth: none`/capability-URL surfaces get `auth: false` |
| `api.json` kind=webhook-in | `wireHTTP` with `auth: false` + signature-verification middleware from the integration |
| `integrations.json` | services in `services.ts` (constructor-injected classes); `configVia` env vars become `wireSecret` / config; per-user credentials become `wireCredential` |
| `architecture.json` notes | deployment config (ports, raw-body routes, proxy expectations) |
| `invariants.json` enforcedBy=db-constraint | migration constraints (UNIQUE, CHECK, FK) |
| `invariants.json` enforcedBy=code-guard/nothing | guard clauses + a test each; `atRiskBecause` entries get a hardening task |
| `gaps.json` | excluded from generation; `open-product-decision` + `migration.json.decisionsNeeded` go to a human BEFORE generation starts |
| `migration.json.mappings` | the work plan: one mapping = one migration slice |
| `interfaces.json` kind=cli | `wireCLI` entrypoints — the CLI commands are the same funcs the routes expose |
| `interfaces.json` kind=mcp | `wireMCP` — each MCP tool IS a `pikkuFunc` (reuse the command/query funcs; don't author tool duplicates) |
| `interfaces.json` kind=openapi-rest / sdk | generated, not hand-written: the OpenAPI spec + typed client SDK fall out of the `wireHTTP` routes + codegen |
| `interfaces.json` kind=websocket-realtime | `pikku-realtime` EventHub topics / channels |
| `frontend.json` | `apps/app` (TanStack Start) shell: router, `@pikku/mantine` theme, `pikku-react-query` data layer, `better-auth` client — the target stack the legacy UI is rebuilt onto |
| `frontend-routes.json` | TanStack Router routes under `apps/app/src/routes/**` (thin data containers calling `usePikkuQuery`); `dataFrom` names become the generated hooks; subpath routes for rich detail views |
| `frontend-components.json` rebuild=`mantine-standard`/`mantine-composition` | components in `packages/components` composed from `@pikku/mantine` — the trivial/straightforward bulk |
| `frontend-components.json` rebuild=`custom-logic` | the PORT list — each becomes a `packages/components` component that reimplements the bespoke behavior (chart/table/editor); its `dependencies` inform whether the lib is kept or replaced. These are the frontend's real work items |
| `frontend-components.json` rebuild=`custom-style` | normalize to Mantine/theme tokens; usually deleted-and-recomposed, not ported |

## Order of generation

1. Human resolves `decisionsNeeded`.
2. Entities → migrations + types.
3. Policies → permission functions (before commands, so commands can reference them).
4. Commands + queries → funcs; api.json → wirings.
5. Events → topics/queues; system workflows → schedulers/workers/workflows.
6. Scenarios → tests. Run them against the new implementation; they encode the legacy behavior worth preserving.

## Uncertainty handling

- `confidence: high` concepts generate directly.
- `confidence: medium` concepts generate, but are listed for review in the pre-generation report — id, evidence summary, and what is uncertain — rather than carrying a marker comment in the generated code. The report is the review surface; the generated code stays clean.
- `confidence: low` concepts are NOT generated automatically — they surface in the pre-generation review along with `decisionsNeeded`.
