---
name: pikku-blueprint-to-fabric
description: 'Rebuild a legacy app as a Pikku Fabric app from a `.knowledge/` Product Blueprint (produced by pikku-software-archaeology). Covers the blueprint→Fabric mapping (domains→slices, commands/queries→pikkuFuncs, entities→SQLite migrations, policies→permissions, invariants→DB constraints, workflows→schedulers, frontend-routes→TanStack+Mantine), the decisions gate, and the parity report. TRIGGER when: a `.knowledge/` blueprint exists and the user wants to rebuild/port/recreate that app in Pikku or Fabric, or says "rebuild this from the blueprint". DO NOT TRIGGER when: no blueprint exists (run pikku-software-archaeology first), or the user wants a single new feature in an existing app (use pikku-build).'
installGroups: [fabric]
argument-hint: '<path to .knowledge/> [domain to slice next]'
---

# Blueprint → Fabric

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. **Validate the blueprint before you trust it.** Run the archaeology validator; `0 error(s)` or stop.
2. **Clear the decisions gate.** Unresolved `decisionsNeeded` block the domains they touch. Ask; do not invent.
3. **Build the schema first**, from `entities.json` — everything else hangs off it.
4. **Then one vertical slice per domain, in dependency order.** Each slice ships functions + permissions + migrations + scenarios and verifies green before the next starts.
5. **Verify with `pikku fabric validate --json`, then codegen and `tsc`** after every slice (Stage 8 has the exact commands). Never batch a whole app and verify at the end.
6. **Write the parity report as you go**, not at the end — it is the deliverable that proves the rebuild is complete.

This skill is the **translation layer** only. For how Fabric itself works (SQLite/libSQL, `fabric.config.json`, deploy provider, project layout) read **pikku-fabric**. For everything else, delegate to the sibling skill named at each step.

## The one idea

**The blueprint is a plan, not a transcript.**

A faithful port reproduces the legacy app's bugs, dead code, and drifted rules — and you will have spent months to arrive back where you started. The blueprint already separates the **product** (what the business meant) from the **accident** (what the code happened to do): that separation is `gaps.json`, `migration.json.dropped`, `invariants.enforcedBy: "nothing"`, and the `confidence` field. Using that separation is the entire reason the blueprint exists.

So:

- `commands.json` / `queries.json` / `entities.json` / `policies.json` → **build these**.
- `gaps.json` (`kind: bug` / `dead-code`) and `migration.json.dropped` → **do not build these.** They are the accident.
- `invariants.json` with `enforcedBy: "nothing"` → **build these properly for the first time.** This is where a rebuild actually earns its cost.
- `decisionsNeeded` → **ask.** These are the questions the legacy code never answered, and neither can you.

If you find yourself opening the legacy source to "check how it did X", stop. Either the blueprint says X (build that) or it doesn't (it's a decision — ask). Reading the old code is how its accidents get back in.

## Stage 0 — Preflight

```bash
node <archaeology-skill-dir>/scripts/validate.mjs <repo>/.knowledge   # must print 0 error(s)
```

A blueprint with validation errors has dangling concept names, and concept names are the IDs this whole skill maps on. Fix it there, not here.

Then read, in this order — **whole files, once**: `product.json` (what it is, and the terminology traps), `domains.json` (the slice list and the roll-ups), `migration.json` (what survives, what drops, what's undecided). These three tell you the shape of the job. Read the rest per-slice, not up front — `commands.json` at 180+ entries will drown you if you read it whole before you need it.

### The terminology trap — do this before you name anything

`product.json.terminology` and `migration.json.decisionsNeeded` frequently carry a **false friend**: a word the legacy code used that means something else to everyone else (a real case: `tenant` meaning *the seller's own market/legal entity*, not a customer org — where the customer org was `Company`).

Carrying a false friend into the rebuild wastes the single cheapest opportunity you will ever have to fix it. Resolve the rename **before the first migration is written**, then apply the new name in table names, function names, and types. Add it to the parity report's glossary so the mapping stays legible to whoever compares old and new.

## Stage 1 — The decisions gate (blocking)

Collect every:

- `migration.json.decisionsNeeded[]`
- `gaps.json[]` where `kind: "open-product-decision"`
- any concept with `confidence: "low"`

**These block the domains they touch. They do not block the whole rebuild** — take them to the user grouped by domain, so unaffected slices proceed while decisions are pending.

Present each as a real question with the options the code implies and what each costs — not "what should happen when a renewal fails?" but "the `unpaid` state exists and nothing can reach it; when a renewal payment fails, do we (a) lapse immediately, (b) grace period of N days, (c) suspend the public listing but keep the account? (c) is what the listing gate implies but nothing implements it."

**Never resolve one by reading the legacy code.** If the code answered it, the archaeologist would not have raised it. Silence in the legacy code is the finding.

Record each answer in the parity report under **Decisions taken** with the date and who decided. This is the audit trail for behaviour that is *deliberately* not a port.

## Stage 1.5 — Emit the implementation inventory (do this before any code)

```bash
node <skill-dir>/scripts/inventory.mjs <repo>/.knowledge --resolved 1,2 > <repo>/.knowledge/implementation-inventory.md
```

This projects the blueprint into **Pikku terms** — every `pikkuFunc`,
`pikkuPermission`, `wireScheduler`, `wireQueueWorker`, webhook ingress, event
channel, table and scenario that will exist, per domain, plus what is **blocked**
by an open decision and what is **deliberately not built**. `--resolved` takes the
1-based indices of `decisionsNeeded` already answered at the gate.

Do this **before** scaffolding, and show it to the user. Three reasons:

1. **It makes the size real.** "Rebuild the app" is not a plan; "187 functions, 61
   permissions, 12 scheduled tasks, 268 scenarios, 33 custom-logic components, and
   14 concepts blocked behind 4 questions" is one. Nobody can consent to the work
   until they can see it.
2. **It is derived, so it cannot flatter you.** Every number is a projection of the
   blueprint. If it says 12 scheduled tasks, the blueprint found 12 cron jobs.
3. **It exposes the ratio that matters.** A 223-surface `api.json` typically yields
   ~20 `wireHTTP` wirings; the rest is RPC. If your inventory says otherwise, you
   are about to transcribe the legacy router.

The classifier is a heuristic over `workflows.json` triggers and is **advisory** —
check its calls. The distinctions it encodes are the ones that matter:

- **system + cron → `wireScheduler`**; **system + webhook → ingress**;
  **system + queue → `wireQueueWorker`**.
- **system + `after_commit`/callback → an event and its consumers**, NOT a
  workflow. That trigger is the legacy shape of an event: a handler doing five
  unrelated things because there was no bus. Splitting it is the upgrade.
- **user/admin journeys → scenarios, NOT `pikkuWorkflowFunc`s.** A blueprint
  "workflow" is a *journey* — a sequence a person drives through the UI. A
  `pikkuWorkflowFunc` is durable multi-step orchestration. Conflating them produces
  a workflow engine driving form submissions, which is the most common way this
  mapping goes wrong.

Re-run it per slice: the blocked count falls as decisions land, and it is the
cheapest progress report you have.

## Stage 2 — Scaffold

Clone the Fabric starter template, then do the post-clone cleanup **pikku-build** covers (README, package name, lockfile, leftover template artifacts) — a rebuild that ships the template's own name and readme is the first thing a reviewer notices. Set `projectId`, `production.branch` and the frontend entry in `fabric.config.json` per **pikku-fabric**.

Map `architecture.json` onto Fabric honestly, and expect it to shrink:

| Blueprint `architecture.json` | Fabric |
|---|---|
| API/web process (Puma, Express, …) | the Fabric worker — no component to build |
| Worker process + queue | `wireQueueWorker` (**pikku-wiring**) |
| Cron/scheduler component | `wireScheduler` (**pikku-wiring**) |
| Reverse proxy, deploy tooling, process manager | **drop** — the platform does this |
| Admin console (ActiveAdmin, Django admin, …) | `scaffold.console: true` first; only build screens for what it genuinely can't express |
| Session/auth store | Better Auth (**pikku-auth**) |
| Relational datastore | SQLite via libSQL/Kysely (**pikku-fabric**, **pikku-kysely**) |
| Redis for cache/locks/queues | usually **nothing** — see the trap below |

**The Redis trap.** Legacy apps use Redis for four unrelated jobs: queue backend (→ Fabric's queue), cache (→ usually delete; measure first), pub/sub (→ **pikku-realtime**), and **distributed locks**. That last one is the trap: a lock is nearly always a workaround for a missing database constraint (`invariants.json` will show the same rule with `enforcedBy: "code-guard"` and an `atRiskBecause`). Port the *invariant* to a constraint; do not port the lock. Re-implementing legacy locking on a new stack is how you carry a race condition across a rewrite.

`architecture.json.deploymentConstraints` is the exception to "drop the infrastructure": entries there are constraints that must **survive** (raw-body ordering for webhook signatures, retry semantics an external caller depends on). Read them; they are cheap to lose and expensive to rediscover.

## Stage 3 — Schema first

Build the whole schema from `entities.json` before writing functions: plain numbered `.sql` in `db/sqlite/`, applied with `pikku db migrate`, which regenerates the Kysely types. **Never hand-edit the generated `schema.gen.ts`.**

Check the numbering against what is already there — the starter template ships
migrations of its own (Better Auth's schema, the audit table, the auth plugins),
and a colliding number applies in an order you did not intend.

**Use semantic column types.** `BOOLEAN` types as a real `boolean`, `DATETIME`/`DATE`
as a `Date`, `JSON` as a parsed object — the generated types and coercion follow from
the SQL. Writing `INTEGER` 0/1 flags or Unix-ms timestamps throws that away and you
hand-coerce forever. `TEXT` + `CHECK` for a closed set is the highest-leverage choice
available: the constraint compiles into a **TypeScript union type**, so an invalid
state is a compile error rather than a runtime one.

The blueprint gives you `attributes`, `relationships`, `states`, `transitions`, `ownership`, `constraints`. It is a *domain* model, not the legacy DDL — you are not required to reproduce the old column layout, and usually shouldn't.

### Legacy SQL → SQLite traps

| Legacy | SQLite / Fabric | Why |
|---|---|---|
| `DECIMAL`/`NUMERIC` money, or a money library's `*_cents` | `INTEGER` minor units | SQLite has no exact decimal. Minor units are what the legacy money library stored anyway — keep the currency in its own column. **Never `REAL` for money.** |
| `TIMESTAMP`/`DATETIME` | `DATETIME` | Types as a real `Date`. Do NOT store Unix ms in an `INTEGER` — you lose the typing and coerce by hand forever. |
| `BOOLEAN` | `BOOLEAN` | Types as a real `boolean`. Do NOT store 0/1 in an `INTEGER`. |
| `ENUM` | `TEXT` + `CHECK` | The one place to spend a `CHECK` — it is a closed set, and a typo'd state is exactly the bug class the blueprint keeps finding. |
| `uuid`/`serial` PK | `INTEGER PRIMARY KEY AUTOINCREMENT`, or `TEXT` for a public id | **Look at `queries.json.scoping` first.** If the legacy app used a random public id (`puid`, slug) precisely so ids aren't enumerable, that is a *security property* — keep it. Silently switching to sequential integers un-fixes a fix. |
| JSON column | `TEXT` + a typed parse | Fine, but if `entities.json` gives it real attributes, it wants columns. |
| DB-level `CHECK` sprawl | app-level validation | Per **pikku-fabric** — *except* the invariants below. |

### States and transitions

`entities[].states` + `transitions` is a state machine the legacy app ran through a library (aasm, state_machine, …). **Do not port the library.** Store the state as `TEXT` + `CHECK`, and let each transition be the `pikkuFunc` that `commands.json` already names (`CancelMembership`, `RefundInvoice`).

Two traps the blueprint hands you for free:

- **Unreachable states.** A state in `entities[].states` that no transition targets is either a dead declaration (drop it) or a `decisionsNeeded` (ask). Do not create an unreachable state in the new app just because the old one had it.
- **Dead transitions.** `migration.json.dropped` may list a transition dropped for a typo (a real case: `partial_refunded` vs `partially_refunded`, which made multi-step partial refunds raise). Build the transition the product **means**, which is the one the state list supports — not the typo.

## Stage 4 — Slices, in dependency order

One vertical slice per domain. **Order by inbound reference count, not by importance**: the domains everything else points at go first. Identity and the customer/account domain are almost always the base — every other domain's `ownership` and `scoping` mentions them.

Derive the order mechanically: for each domain, count how many *other* domains' entities have a relationship into it. Build the most-referenced first. Then, among the rest, take the ones that carry the most invariants and events (`domains.json` roll-ups tell you) — that's where the product is, and you want it under test early.

Leave for last: thin CRUD domains with no events and no invariants (content, downloads, media libraries). They're mechanical, and `migration.json` may well say the honest thing — that some shouldn't be rebuilt at all.

### What one slice contains

| Blueprint | Fabric artifact | Skill |
|---|---|---|
| `commands[]` | one `pikkuFunc` per command, one per file, `expose: true` | **pikku-concepts** |
| `queries[]` | one `pikkuSessionlessFunc`, `readonly: true`, `expose: true` | **pikku-concepts** |
| `commands[].preconditions` | guards in the function body, throwing typed errors | **pikku-fabric** hard rules |
| `policies[]` | `pikkuPermission` on the function's `permissions:` field | **pikku-permissions** |
| `queries[].scoping` | the permission + the query's `where` | **pikku-permissions**, **pikku-kysely** |
| `events[]` | realtime topic / queue message | **pikku-realtime**, **pikku-wiring** |
| `workflows[] kind: system` | `wireScheduler` | **pikku-wiring** |
| `workflows[]` multi-step | `pikkuWorkflowFunc` + `*.steps.ts` | **pikku-workflow** |
| `workflows[].scenarios[]` | scenario tests | **pikku-scenario** |
| `api[]` | mostly **nothing** — see below | **pikku-wiring** |
| `invariants[]` | DB constraints, in the migration | **pikku-fabric** |
| `integrations[]` | services | **pikku-services** |

### Names are the contract

`commands.json`/`queries.json` names are already imperative domain-language `VerbNoun` — which is exactly `pikkuFunc` naming. **Carry them verbatim.** They are the IDs that tie the blueprint, the parity report, `frontend-routes.json.dataFrom`, and the generated RPC client together. Renaming `AssignMembershipToUser` to `assignMembership` because it reads better costs you the whole cross-reference and buys nothing.

Two exceptions: apply resolved false-friend renames (Stage 0), and apply any rename the user decided at the gate. Record both in the parity glossary.

Every function needs a real `description` — take it from the concept's `description`/`purpose`, which is already written in product language. Per **pikku-fabric**, `missing description` means the work isn't finished.

### The API is not the contract

`api.json` has one entry per legacy surface, and it is **evidence, not a spec**. Each entry's `mapsTo` names the command or query — build *that*, and let RPC be the transport (**pikku-fabric**: RPC first, `expose: true`).

Add `wireHTTP` only where the URL shape is a real external contract:

- `auth: "none"` public pages that must keep their paths (SEO, printed links, QR codes)
- **inbound webhooks** — the sender's URL is fixed (**pikku-wiring**)
- surfaces `interfaces.json` marks as a genuine `openapi-rest` channel with external consumers

A 200-surface `api.json` typically yields a handful of `wireHTTP` calls. If you're wiring HTTP for most of it, you're transcribing the legacy router.

`api.json.auth` is still load-bearing: it's the per-surface answer that fills each function's `permissions:`. Where `auth` and `policies.json` disagree, the disagreement is a finding — check `gaps.json`, and if it's not there, raise it.

### Invariants — where the rebuild earns its cost

For each `invariants[]` entry, look at `enforcedBy`:

- `"nothing"` → **build it properly now.** This is the highest-value work in the whole rebuild: a rule the business believes it has and does not. It's typically a `UNIQUE`, a `CHECK`, a foreign key, or a transaction — cheap here, and the legacy app couldn't get to it because the enforcement had drifted somewhere unreachable.
- `"convention"` or `"code-guard"` with an `atRiskBecause` → **move it down to the database** if it's expressible there. `atRiskBecause` usually describes a race the constraint eliminates outright.
- `"db-constraint"` → carry it across. It already works.

Two patterns worth naming, because they recur:

- **Read-then-write idempotency** (check `find_by(external_id:)`, then insert) on a **nullable, non-unique** column. The fix is a `UNIQUE` index and an upsert — not a port of the check.
- **Application-held sequence numbers** (an invoice counter behind a distributed lock). Use a DB-level guarantee. If a legacy test for this is commented out (the blueprint flags this under `gaps.json`), write it for real in the new app — that's a scenario, and it's the one that would have caught it.

### Events — make the implicit explicit

Most `events[]` in a legacy blueprint carry `explicit: false`: there was no event bus, and the archaeologist reconstructed the event from a side-effect cluster (an email + a status flip + a counter bump in one handler). The `consumers` field lists what reacted.

In the rebuild these become real: publish the event (**pikku-realtime**) or enqueue it (**pikku-wiring**), and make each listed consumer its own subscriber. That is the structural upgrade — the handler stops doing five unrelated things, and adding a sixth consumer stops meaning editing the handler.

Two disciplines:

- **Do not invent events.** The archaeologist applied a threshold (≥1 real consumer beyond the row write). If a CRUD fact isn't in `events.json`, it didn't earn an event; a state row that is only *read* later is state, not an event.
- **`explicit: false` is a confidence marker.** These are reconstructions of intent. When one drives money or an external side effect, the parity report says it was reconstructed — the reviewer should confirm the consumer list is complete.

### Policies — collapse the drift

`policies[].enforcedAt` lists **every** legacy site enforcing the rule. Two or more entries usually means it drifted — same rule, subtly different versions. The blueprint often pairs it with a `gaps.json` `duplication` entry naming the drift.

The whole point is **one `pikkuPermission` per rule**, referenced from every function that needs it (**pikku-permissions**). When the `enforcedAt` versions genuinely disagree, that's a decision, not a merge — ask which is correct. Picking the one you read first silently ships a behaviour change.

Per **pikku-fabric**: no auth checks in function bodies. If a policy resists expression as a permission, that's a signal it's a *business rule* (a precondition) rather than authorization — those live in the function body and throw typed errors.

## Stage 5 — Scenarios from the blueprint's tests

`workflows[].scenarios[]` entries carry `fromTest` — they were excavated from the legacy suite, which means **they are the legacy app's executable spec**, already in given/when/outcome shape. They map directly onto **pikku-scenario** actors and flows, and `product.json.actors` gives you the actor list.

This is the highest-leverage stage in the rebuild and the easiest to skip. A scenario ported from a legacy test is the only artifact that can tell you the new app *behaves* like the old one — parity of function names proves nothing.

Two rules:

- A scenario whose legacy test was **commented out or broken** (`gaps.json` flags these) still gets written — it just isn't parity, it's new coverage. Note which in the parity report; often the disabled test is disabled *because* the behaviour was broken.
- A workflow with **no scenarios** is a gap in the blueprint, not permission to skip testing. Flag it rather than inventing behaviour to test.

## Stage 6 — Integrations

`integrations[]` gives `direction`, `dataExchanged`, `importance`, `replacementDifficulty`, `envVars`.

- `replacementDifficulty: "hard"` + `importance: "critical"` → **keep**, and put it behind a service (**pikku-services**). These are the load-bearing vendors; a rebuild is not the time to also swap them.
- `"trivial"` → candidates for a platform-native equivalent, but only if the user wants it. Swapping a vendor mid-rebuild makes every failure ambiguous.
- `envVars` → `defineVariable` / `defineSecret` (**pikku-services**). Per **pikku-fabric**: no `process.env`, ever.

**Secrets in the blueprint are live secrets.** `gaps.json` security entries routinely name credentials hardcoded in the legacy source *and its committed history*. They must be **rotated**, not copied into the new app's secret store — and rotation is the legacy app's problem, today, independent of the rebuild. Say so; don't let the rebuild timeline become the remediation timeline.

**Inbound webhooks deserve a real look.** They're the surfaces most likely to be carrying a `gaps.json` security entry (unverified signatures, disabled checks). Rebuild the verification properly (**pikku-wiring**), and if the reason it was disabled was a vendor that doesn't reliably sign, that's a `decisionsNeeded` — not something to replicate.

## Stage 7 — Frontend

Only when `frontend*.json` is present. Target: TanStack Start + Mantine.

`frontend.json` records the legacy stack as facts. **It is context, not a port target** — a bespoke Sass system, a server-rendered template stack, or a different component library all land on the same target. Read `designSystemConsistency` and `designFindings` to know what *not* to carry: findings are the drift (hardcoded colors, forked-per-locale pages, duplicated components), and the rebuild is the moment they cost nothing to drop.

### Routes

`frontend-routes[]` → TanStack routes. `path` and `purpose` carry over; `auth` becomes the route guard.

**`dataFrom` is the payoff.** It lists query/command names — the *same* names as `queries.json`/`commands.json`, which are the same names as your `pikkuFunc`s, which are the same names in the generated client. So a route's data layer is mechanical: each `dataFrom` entry is a generated hook (**pikku-react**). If `dataFrom` contains a name that isn't a real function, the blueprint wasn't reconciled — go fix it there.

### Components — the honest cost

`frontend-components[].rebuild` is the only field that matters for planning:

| `rebuild` | What to do |
|---|---|
| `mantine-standard` | Use the Mantine component. Do not port. |
| `mantine-composition` | Compose from Mantine primitives. Do not port. |
| `custom-style` | Normalize to Mantine + theme tokens. The divergence is the thing to drop. |
| **`custom-logic`** | **Port the behaviour.** Read `customLogic` and `dependencies`. |

The first three are the bulk and they're cheap — they're a re-expression, not a migration. **`custom-logic` is the actual project**: the bespoke chart, the virtualized table, the map surface, the rich editor, the drag interaction. Each has real behaviour that must survive, and `customLogic` says what it is.

Two things to watch:

- **Scope `custom-logic` explicitly, per component, before starting the frontend.** If a single component is thousands of lines (a map/finder surface is the classic), it is a project of its own and must be planned as one. "It's just screens" is how frontend rebuilds overrun.
- **Forked twins.** `designFindings` often shows the same custom-logic surface duplicated (a finder and its near-identical sibling). Build it **once**, parameterized. That's a rebuild dividend — say so in the parity report.

## Stage 8 — Verify

Per slice, narrowest first:

```bash
pikku fabric validate --json     # structural: fix every error and warn
yarn pikku all                   # codegen + version compliance
yarn tsc --noEmit
```

Then run the slice's scenarios. All four green — validate, codegen, `tsc`, scenarios — is what "slice done" means; three of four is a slice you have not finished. **pikku-fabric** owns the loop and what each finding means.

Never batch. A rebuild verified only at the end gives you an undifferentiated pile of failures with no bisect point, and the whole reason for slicing is that each slice is a checkpoint you can trust.

New functions with `expose: true` are versioned from the start — `pikku versions` / `pikku semver` (**pikku-meta**); you're establishing v1 contracts, not migrating them.

## Stage 9 — The parity report (the deliverable)

Write `<repo>/.knowledge/parity-<domain>.md` per slice, as you finish it. This is a real output, not
bookkeeping: it is the one place a human can answer "is the rebuild done?" without reading the
diff, because it is the only document that holds the blueprint and the new code side by side.

Per domain:

- **Built** — each command/query/event/policy → its function/file. The concept-name-as-ID makes this a table, not prose.
- **Deliberately not built** — from `migration.json.dropped` and `gaps.json`, with the reason. *The most important section.* Without it, every dropped bug and orphan reads as a regression to whoever reviews.
- **Decisions taken** — each gate answer, who decided, when. Behaviour that deliberately differs from the legacy app.
- **Now enforced** — invariants that were `enforcedBy: "nothing"` and now have a constraint. The rebuild's actual dividend, in one list.
- **Reconstructed** — anything from `confidence: low`/`medium` or `explicit: false` events. Flag for confirmation against production behaviour.
- **Not verifiable from the blueprint** — what needs real data or a human (volume-dependent races, whether a legacy bug ever fired).
- **Glossary** — legacy name → new name, for every rename including the false friends.

## Red flags

| Thought | Reality |
|---|---|
| "Let me check how the old code did this" | The blueprint says what it does. If it doesn't, it's a decision — ask. Reading legacy source is how its accidents get re-imported. |
| "I'll port the state machine library" | Port the *states and transitions*. The library is implementation; `commands.json` already names every transition. |
| "The blueprint lists this state, so I'll create it" | Check it's reachable. Unreachable states are a finding, not a spec. |
| "I'll wire HTTP for each `api.json` entry" | You're transcribing the legacy router. RPC first; `wireHTTP` only for genuinely fixed external URLs. |
| "The old app didn't enforce it, so neither will I" | `enforcedBy: "nothing"` is the highest-value work in the rebuild — the reason it's worth doing at all. |
| "I'll add events for the CRUD actions too" | The archaeologist applied a consumer threshold. Not in `events.json` = didn't earn one. |
| "Two enforcement sites disagree; I'll use the first one" | That's a silent behaviour change. Drift is a decision — ask which is correct. |
| "It's just screens, the frontend is quick" | The `custom-logic` components are the project. Scope them individually before starting. |
| "I'll copy the secrets into the new secret store" | Blueprint-exposed secrets are burned. Rotate. And the legacy app needs that today, regardless of the rebuild. |
| "I'll do the parity report at the end" | You will not remember why you dropped things, and dropped-on-purpose will read as regression. |
| "Verify once it's all built" | No bisect point. Verify per slice; that's what slices are for. |
| "The blueprint has a `low`-confidence entry, I'll build my best guess" | That's inventing product. It's a gate question. |

## Quick reference

```bash
node <archaeology-skill>/scripts/validate.mjs <repo>/.knowledge   # Stage 0 — must be 0 errors
# Stage 1 — decisions gate: ask, don't invent
# Stage 2 — clone starter template, then the post-clone cleanup (pikku-build)
# Stage 3 — entities.json -> db/sqlite/NNNN-*.sql ; pikku db migrate
# Stage 4..7 — one domain slice at a time, dependency order
pikku fabric validate --json
yarn pikku all && yarn tsc --noEmit
# Stage 9 — .knowledge/parity-<domain>.md per slice
```

## Relationship to the other skills

```
legacy repo → pikku-software-archaeology → .knowledge/ blueprint
                                                  └→ pikku-blueprint-to-fabric → Fabric app + parity-*.md
```

**pikku-software-archaeology** extracts the facts and validates them. **This skill** builds the
thing, and emits `parity-*.md` so the rebuild can be reviewed against the blueprint rather than
against the legacy code.

For Fabric mechanics — project layout, `fabric.config.json`, the validate loop, reading a deployed
stage — use **pikku-fabric**. For a single feature *after* the rebuild, and for the post-clone
cleanup in Stage 2, use **pikku-build**.
