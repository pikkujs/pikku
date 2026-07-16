---
name: pikku-software-archaeology
description: 'Use when reverse-engineering an existing repository into a Product Blueprint — recovering what product an undocumented or organically-grown codebase implements so it can be rebuilt cleanly (e.g. as a Pikku app). TRIGGER when: user says "extract a blueprint", "reverse engineer this app", "what does this codebase actually do as a product", "prepare this repo for a rewrite/migration", or points at a legacy repo (any language — JS, TS, Ruby, Python, PHP, Go) and asks for its domains, workflows, business rules, or a rebuild plan. DO NOT TRIGGER for: documenting code structure, generating API docs from an already-clean codebase, or code review.'
installGroups: [fabric]
---

# Software Archaeology

## Overview

Extract **intent over implementation**. A repository is a fossil record of product decisions; your job is to recover the product — domains, entities, commands, queries, events, policies, workflows, invariants — not to describe the code. The output is a `.knowledge/` directory of schema-validated JSON plus a human-readable `blueprint.md`, consumable by a generator (Pikku) to rebuild the application cleanly.

**You are the parser.** Do not build or rely on regex/AST scanners — read the code with your own tools (Grep, Read, subagents). This is what makes the skill language-agnostic: an Express app, a Rails app, and a Django app all yield the same blueprint shape.

**Two layers, never merged silently:**
- **Facts** — behavior directly observed in code, schema, or tests. Cite them.
- **Inferred intent** — the product reasoning you reconstruct. Mark it with `confidence` and say what evidence it rests on.

Never present a guess as a fact. `confidence: "high"` requires file:line evidence of the behavior itself.

## Output Contract

Everything goes in `<repo>/.knowledge/` (or a caller-specified directory):

```
.knowledge/
├── product.json        # purpose, actors, capabilities, terminology
├── domains.json        # business domains (NEVER folder names)
├── entities.json       # domain entities: attributes, relationships, states, transitions
├── commands.json       # state-changing actions (SendInvoice, not POST /invoices/:id/send)
├── queries.json        # read operations and views
├── events.json         # business facts, past tense (InvoicePaid) — no technical events
├── policies.json       # authorization, validation, state, business-constraint rules
├── workflows.json      # user + admin + system workflows, with test-derived scenarios
├── api.json            # every surface, each mapped to a command/query/event-ingress
├── integrations.json   # external services: purpose, direction, replaceability
├── architecture.json   # components, datastores, deployment constraints worth keeping
├── invariants.json     # what must ALWAYS be true, and what enforces it today
├── gaps.json           # TODOs, hacks, duplication, dead code, open product decisions
├── migration.json      # current files -> future concepts, drops, decisions needed
├── blueprint.md        # human synthesis of all of the above
│
│   # OPTIONAL — the consumer-surface layer. Emit these when the repo has a
│   # frontend and/or non-HTTP consumer channels. A backend-only repo omits them
│   # and the validator does not complain.
├── interfaces.json         # every way the product is consumed: web-ui, cli, mcp, openapi-rest, sdk, realtime, webhooks
├── frontend.json           # web-UI app shape: framework, router, styling, data layer, auth (e.g. TanStack Start + better-auth + Mantine)
├── frontend-routes.json    # the page/route tree — what a user navigates to, its data + components
└── frontend-components.json# component inventory; `rebuild` splits trivial-Mantine from custom-logic-to-port
```

The exact field shapes live in `references/blueprint.schema.json` (in this skill's directory — read it before writing any output file). After writing, ALWAYS run:

```bash
node <skill-dir>/scripts/validate.mjs <repo>/.knowledge
```

and fix every ERROR (WARNs are prompts to double-check, not necessarily wrong). Do not declare the extraction done with validation errors outstanding.

## The Pipeline

Work in phases. For small repos (< ~50 source files) do them inline; for larger repos, fan out subagents per phase-3 lens and merge (see "Scaling up").

### Phase 1 — Survey (facts only)

Build an inventory before interpreting anything:
- Manifests (`package.json`, `Gemfile`, `pyproject.toml`, `go.mod`, `composer.json`): dependencies are integration hints; scripts are entry points.
- Entry points: servers, route registrations, cron/scheduler setup, queue workers, CLI binaries.
- Data layer: migrations, schema files, model classes, raw DDL (check comments too — schemas hide in comments in migration-less repos).
- Every HTTP/GraphQL/RPC surface, webhook, scheduled job, queue consumer.
- **All consumer channels, not just HTTP**: a frontend app (`apps/`, `frontend/`, `web/`, `client/`), a CLI (`bin/`, `wireCLI`, a `cli/` dir, an `openapi`-generated command tool), an MCP server (`wireMCP`, `@modelcontextprotocol`, a `mcp`/`tools` dir), an OpenAPI/Swagger spec (`openapi.json`, `swagger`), a published/generated SDK, realtime channels (websocket/SSE). Each is an `interfaces.json` entry.
- Env vars and config files.
- TODO / FIXME / HACK / XXX / deprecated markers — each is a gaps.json candidate.
- **The test suite** — locate it now, excavate it in Phase 2.

Where intent hides, per ecosystem (read these first):

| Ecosystem | Highest-yield locations |
|---|---|
| Rails | `config/routes.rb`, model validations + callbacks + `aasm`/state machines, `app/policies` (Pundit) / `ability.rb` (CanCan), Sidekiq/ActiveJob workers, `db/schema.rb`, specs (esp. request + model specs) |
| Express/Node | route registration files, middleware chains (auth!), inline `if` guards in handlers, SQL/ORM models, `jobs/`+crontab refs, webhook handlers |
| Django | `urls.py`, model `Meta`/constraints/`clean()`, DRF serializers + permissions classes, celery tasks, admin.py (reveals internal workflows) |
| Laravel | `routes/`, FormRequests (validation), Policies/Gates, Jobs + scheduler in `Kernel.php`, migrations |
| Go | mux/router setup, middleware, struct tags, `cmd/` binaries (each is a component) |
| Frontend (React/Vue/etc.) | router config / file-based routes (pages a user reaches), the component tree, the design-system import (`@mantine/*`, `@mui/*`, Tailwind config) to judge consistency, the data layer (react-query/tRPC/fetch wrappers) to tie UI back to backend queries, charts/tables/editors (the `custom-logic` port risk), auth wiring |

### Phase 2 — Test excavation (do not skip)

Tests are the closest thing to an executable product spec. For every test file:
- `describe`/`context`/`it` names → **scenarios** (attach to the matching workflow in `workflows.json` under `scenarios[]`, with `fromTest` set).
- User-flow/journey harnesses (`pikkuUserFlow` stories, cucumber `.feature` files, Playwright journeys) are the highest-grade scenario source — they already ARE given/when/outcome sequences; extract them verbatim.
- Assertions → confirmations of policies and invariants (upgrade their `confidence` to `high`, add the test as evidence).
- Fixtures/factories → entity attribute shapes and realistic example data.
- Edge-case tests → business rules that exist **nowhere else in the code** (e.g. "replayed webhook events are idempotent" may only be stated in a test).
- Untested-but-critical paths, or a test suite that can't run (missing helpers, broken setup) → `gaps.json`.

A rule attested by both an implementation guard AND a test is your strongest possible evidence — cite both.

### Phase 3 — Extraction lenses

Run each lens over the surveyed material. Rules that counter the classic failure modes:

**Domains** — infer from data ownership, workflows, and vocabulary; NEVER from folder names. `controllers/` is not a domain; "Billing" is. A domain owns entities and the commands that mutate them.

**Entities** — domain concepts, not tables. Include: attributes (from schema + serializers + fixtures), relationships, **lifecycle states and transitions** (grep status/state columns, then find every write to them — each write site is a transition with a trigger), ownership (which actor's rows), constraints.

**Commands** — every way state changes: routes, jobs, webhooks, CLI, admin consoles, DB triggers. Name them imperative `VerbNoun` in domain language: `POST /api/users/:id/status` → `ActivateUser`. For each: actor, preconditions (every `if (...) return 4xx` guard is a precondition or policy), effects, events produced. Convention: authentication/token issuance is a command (`LogInUser`, effect: "issues a session/JWT") even though it writes no rows — it changes the caller's security state.

**Queries** — reads and views, `GetX`/`ListX`/`SearchX`. Record the tenancy scoping each applies (a missing `WHERE user_id=` that exists elsewhere is a gaps.json security entry).

**Events** — meaningful business facts, past tense. Most legacy apps have **implicit** events: an email send, a status flip, and a counter bump inside one handler are the event's consumers — reconstruct `InvoicePaid` from them and set `explicit: false`. Exclude technical noise (ButtonClicked, FunctionCalled). Inclusion threshold for implicit events: at least one observed consumer beyond the row write itself (an email, a downstream job, a webhook out, a derived-state flip). Plain CRUD facts with no reaction (`ClientCreated` that nothing listens to) do not become events.

**Policies** — authorization, validation, state rules, business constraints. Record **every** location enforcing each rule in `enforcedAt`; the same rule enforced in 3 places (or worse, 2 slightly different versions) is a gaps.json duplication entry.

**Workflows** — ALL of them: user journeys, admin/support operations, and **system workflows** (cron jobs, queue consumers, webhook reactions, syncs, notification sweeps). A crontab line in a comment is a workflow. Attach Phase-2 scenarios.

**API** — list every surface but map each to its concept (`mapsTo: {type: command, name: SendInvoice}`). The route is evidence; the command is the deliverable. Auth per surface (including "none" and capability-URLs like tokened public links). A webhook whose handler changes state maps to a **command** (`RecordInvoicePayment`); reserve `event-ingress` for pure relay surfaces, where `name` must be an events.json event.

**Integrations** — from deps + config + calls: purpose, data exchanged, direction, importance, replacement difficulty, env vars.

**Architecture** — components as they actually run (API process, worker, cron job, SPA), datastores, and deployment constraints that must survive the rewrite (hardcoded ports with upstream expectations, raw-body middleware ordering, webhook retry semantics).

**Invariants** — what must always hold, and `enforcedBy`: db-constraint, code-guard, convention, or `nothing` (an unenforced invariant is a gap). Include `atRiskBecause` when enforcement is fragile (e.g. read-then-insert sequence numbering races).

**Gaps** — incomplete features, TODOs, hacks (hardcoded admin emails), duplicated logic that drifted, dead code, unclear ownership, and **open product decisions** the code never resolved (a FIXME asking "should deleting a client void invoices?" is a product decision, record it in both gaps.json and migration.json `decisionsNeeded`).

**Migration** — map current file clusters → future domain + concepts; list files to drop with reasons; list decisions a human must make before rebuild.

**Interfaces** (`interfaces.json`, optional) — every way the product is CONSUMED, one entry per channel, not per route. A product is usually driven through several: a **web UI** (humans), a **CLI** (developers/operators), an **MCP server** (AI agents — in a Pikku app each MCP tool IS a `pikkuFunc`), an **OpenAPI/REST** surface (developers/external systems, often *generated* from the routes), a **generated SDK**, **realtime** (websocket/SSE), and **webhooks** (in/out). For each: `kind`, `audience`, `purpose`, roughly how many ops it exposes, whether it's `generated` vs hand-written, which domains it serves, and `status` (complete/partial/stub — an MCP server with two tools is `stub`). This layer answers "who can drive this, and how" — it is the map the second-opinion skill needs to explain that the app is usable by people, developers, and agents.

**Frontend** (`frontend.json` + `frontend-routes.json` + `frontend-components.json`, optional) — the web UI, which needs its own treatment because frontends vary wildly (framework, router, styling, state, data, auth) and the rebuild target is opinionated: **everything in one component system (Mantine), one data layer, one auth**.
- `frontend.json` records the stack as FACTS: framework (e.g. TanStack Start), rendering (SSR/streaming/SPA), router, styling/design system, `designSystemConsistency`, state management, data layer (e.g. pikku-react-query vs REST helpers), auth (e.g. better-auth), i18n. Name the real technologies — the second-opinion skill weighs their tradeoffs, so record them precisely (do NOT editorialize here; this file is facts).
- `frontend-routes.json` is the page tree: each route's `purpose` in product terms, `auth`, the `dataFrom` (query/command names it reads — reuse the backend concept names so the UI ties back to the domain), the `usesComponents`, and the `userFlows` it belongs to.
- `frontend.json.designFindings` captures **broken/inconsistent design patterns** as concrete, cited observations (not taste). Actively hunt for: *interaction inconsistency* (the same job done as a modal in one place and a drawer in another; inconsistent confirm dialogs); *theming not tokenized* (hardcoded hex colors, magic spacing/font sizes, inline styles instead of theme tokens/variables — grep for `#[0-9a-f]{3,6}`, `style={{`, raw `px` values); *cross-page inconsistency* (the same element — button, page header, card — styled differently across routes); *component duplication* (three near-identical cards/tables for one purpose); *design-system bypass* (raw HTML/CSS where a library component exists). Each finding gets an example, its impact (feels unpolished / a color change means hunting every file), and a fix (standardize on one pattern / move to tokens / extract one shared component). These are almost always cheap cleanups, and they are exactly what a non-technical owner perceives as "the app looks off" without being able to say why.
- `frontend-components.json` is where the frontend's real migration cost lives, in the **`rebuild`** field: `mantine-standard` (maps 1:1 to a Mantine component — trivial), `mantine-composition` (built from Mantine primitives — straightforward), `custom-style` (diverges only visually — normalize to Mantine), or **`custom-logic`** (bespoke behavior — a custom chart, a virtualized/complex table, a canvas, drag-and-drop, a rich editor — that must be **ported**, not re-skinned). A `custom-logic` component MUST fill `customLogic` explaining the behavior, and should list the `dependencies` (charting/table/editor libs) that make it a real port. This split — "trivially re-Mantine-able" vs "carries logic that must survive the port" — is the single most useful thing the frontend extraction produces.

### Phase 4 — Cross-check, validate, synthesize

1. Cross-checks before writing: every command has an actor and at least one precondition or policy (or you explain why it is genuinely unguarded); every state transition appears in some command/workflow — if a state is only reachable by manual/DB intervention, record the transition with trigger `"none (manual/DB-only)"` AND add a gaps.json entry; every event has a producer; every api surface maps to a defined concept; every integration is used by some command/workflow.
2. Write all 14 JSON files, sorting every array by `name` (or `path`) — on first extraction too, not just re-runs. Run the validator: done means `0 error(s)` and exit 0, and every WARN explicitly reviewed and either fixed or justified in your summary.
3. Write `blueprint.md`: product summary → domain map → per-domain narrative (entities/commands/events with the interesting rules) → workflows → integrations/architecture → invariants → gaps and open decisions → rebuild recommendation. Write it for the engineer who will rebuild the product and has never seen the legacy code.

## Evidence & Confidence Discipline

- Every concept object carries `evidence: [{file, lines, note}]` and `confidence`. (In `api.json` and `architecture.json`, `confidence` is optional — include it whenever a surface/component is inferred rather than directly observed, e.g. an SPA known only from comments.)
- `high` — the behavior itself is in the cited code/schema/test.
- `medium` — inferred from multiple converging signals (naming + partial code + a test name).
- `low` — plausible reconstruction; MUST also be phrased tentatively in blueprint.md and usually deserves a `decisionsNeeded` entry.
- Comments and docs describe *intended* behavior; code describes *actual* behavior. When they disagree, record the code's behavior as the fact and the disagreement as a gap.

## Scaling up (large repos)

- Fan out one subagent per lens (or per candidate domain) with: the survey notes, the schema file path, and instructions to return JSON fragments with evidence. Merge, dedupe by concept name, then run Phase 4 yourself.
- Fix the domain cut YOURSELF after the survey and hand every lens agent the same canonical domain list — domains are the shared IDs everything cross-references.
- Give each lens agent ownership of whole files (never two agents writing one file), and pair coupled files under one agent (commands+queries+api must share names).
- **Budget a reconciliation pass — parallel agents WILL drift on names** (observed at real scale: 472 validator warnings from one 7-agent run). The pattern: rebuild `domains.json`'s entity/command/query/event/policy roll-up lists LAST, generated by grouping the authoritative files by their `domain` field — never hand-written before those files exist; reconcile `eventsProduced` against curated `events.json` by rename (spelling variant) / drop (CRUD noise, no consumer) / add (only with verified consumer evidence); fill empty command policies by joining `api.json`'s per-surface `auth` against `policies.json` names. The validator's warning list is the reconciliation worklist.
- **Incremental re-runs:** keep concept names stable (they are the IDs). Re-run the affected lens only, diff against the existing `.knowledge/` files, and preserve unrelated entries verbatim. Sort every array by `name` (or `path`) so diffs are meaningful.

## Red Flags — you are about to produce a worthless blueprint

| Thought | Reality |
|---|---|
| "I'll write it up as markdown docs" | Only `blueprint.md` is prose. The 14 JSON files ARE the deliverable; a generator consumes them. |
| "The routes are the API contract" | Routes are evidence. Lift each to a command/query or you've documented plumbing, not product. |
| "This is obvious, no citation needed" | Uncited claims are indistinguishable from hallucinations. Evidence on everything. |
| "The folder structure tells me the domains" | Folders are how it grew, not what it is. Derive domains from ownership + vocabulary. |
| "Tests are just tests, skip them" | Tests are the spec. Some rules exist ONLY in tests. Phase 2 is mandatory. |
| "No events are emitted, so events: []" | Reconstruct implicit events from side-effect clusters; mark `explicit: false`. |
| "Cron jobs aren't workflows" | System workflows are workflows. Include schedules, queue consumers, webhook reactions. |
| "The frontend is just the web routes" | The web UI is ONE interface. Inventory the CLI, MCP server, OpenAPI/SDK, realtime, webhooks in `interfaces.json` too — the product is driven by people, developers, AND agents. |
| "A component list is enough" | Without the `rebuild` split, you've hidden the frontend's real cost. Flag every `custom-logic` component (chart/table/canvas/editor) and say what the logic is — that's the port work. |
| "I'll skip the validator, the JSON looks right" | Run it. Missing domains refs, dangling event names, and undescribed custom-logic components are exactly what it catches. |

## Quick Reference

```bash
# 1. survey + excavate + extract (you, with Read/Grep/subagents)
# 2. write <repo>/.knowledge/*.json + blueprint.md per references/blueprint.schema.json
# 3. validate:
node <skill-dir>/scripts/validate.mjs <repo>/.knowledge
```

- Schema/contract: `references/blueprint.schema.json`
- How Pikku consumes the blueprint: `references/pikku-mapping.md`
