---
name: pikku-n8n-import
description: >-
  Import an n8n workflow JSON export into a Pikku workflow: `pikku import n8n`, filling generated stubs, `*.integrations.json`. Writing workflows by hand is pikku-workflow.
installGroups: [core]
metadata:
  version: 1.0.0
---

# n8n → Pikku Import

Take an n8n export all the way to a compiling, stub-free Pikku workflow. The
`@pikku/n8n-import` package (invoked by `pikku import n8n`) is **frozen**: it does
the provable, mechanical conversion and leaves everything it cannot prove as a
typed stub that throws at runtime. This skill runs that package, then fills the
remainder with judgment, reports what needs a human decision, and verifies.

Never re-do what the importer already did, and never hand-edit generated files to
paper over a stub — fix the source cause (the stub function, the graph node, or a
missing dependency).

## Import an n8n workflow

Run these in order; each step names what to expect and how to recover. Do not
read generated files, `.pikku`, `node_modules` or the importer's source. Every
fact you need comes from the step's own output or `pikku meta`.

1. **Import.** `pikku import n8n <file.json> --out src/<dir>` (run from the
   functions package; give an absolute path, or write the JSON to a file first).
   Without `--out` files land in the package root, outside `srcDirectories`, and
   `pikku all` never sees them. Expect `Imported "<name>" (<shape>) → N file(s)`
   plus lines for the integration manifest, wired addon instances and stub
   functions (each listed by path). Recovery: `[reason] message` means the
   workflow is un-importable; stop and report it.
2. **Install what it names.** For each package in `<slug>.addons.gen.ts` or
   `<slug>.integrations.json`: `pikku addons search <service words>` then
   `pikku addons add <name>`. A `graph:*` step needs `pikku addons add graph`.
   The importer's package names are guesses. Recovery: if no addon exists, delete
   that instance from `<slug>.addons.gen.ts` (otherwise `pikku all` fails on the
   missing package), keep the node as a stub, and report it as a missing
   integration (step 4 below). After the install delete `<slug>.addons.gen.ts`
   when `pikku addons add` has wired the same package (a second `wireAddon` for
   it is redundant).
3. **Read the result.** `pikku meta workflows get "<workflow name>"` shows every
   node: its `rpcName` (`<addon>:<fn>`, `graph:<fn>`, or a local stub function)
   and `input`. For each addon node compare its `input` with
   `pikku meta functions get <addon>:<fn>` (fields, required ones have no `?`):
   the import maps by name and can drop a required field that n8n spelled
   differently (an unmapped `to`, `id`, `sendTo`). Fill the gaps in the graph file.
4. **Fill every remaining stub.** `grep -rln "implement me" src` lists them.
   Route each by its JSDoc marker to the reference below (integration stub,
   Code node, control stub). A Code node arrives already ported (check it, remove
   the `// @ts-nocheck` line once the types are right); an integration stub is
   replaced by an addon step (`nodes: { x: "<addon>:<fn>" }` and delete the stub
   file) or, when no addon exists, reported, not guessed.
5. **Start it.** The importer writes no trigger. A webhook becomes an HTTP wiring,
   a cron a schedule, a manual trigger a plain HTTP wiring. Put in the workflow's
   directory a `pikkuSessionlessFunc` whose body is
   `rpc.startWorkflow('<workflow name>' as never, data as never)` (graph names
   are not in the typed workflow map, hence the casts) and wire it with
   `wireHTTP({ method: 'post', route: '/<slug>', auth: false, func })` (or
   `wireScheduler`); imports are `pikkuSessionlessFunc` from `#pikku/function`
   and `wireHTTP` from `#pikku/http`.
6. **Agent workflows.** The `.agent.ts` carries `// TODO(n8n)` for the model:
   set `model` to one the project has a provider for; keep the prompt as imported.
7. **Generate and type-check in one call.** `pikku all --tsc-summary`. Expect
   `Type check passed — no errors.` Recovery: fix the source cause named by the
   error and rerun. `PKU642`/`PKU340`: the addon is not installed (step 2).
   `Kysely<DB>` vs `Kysely<unknown>` right after an install: duplicate kysely
   copy, a project env problem, not your code; report it.
8. **Check what's left.** `grep -rln "implement me" src` must be empty (or only
   the integrations you reported as missing). `pikku meta workflows list` must
   show the workflow.
9. **Report** (see Final summary): files, workflow shape, missing integrations,
   credentials/secrets the `pikku addons add` output asked to fill in, the agent
   model choice, TODOs.

A credential-free workflow with only built-in nodes takes about 6 calls
(import, `addons add graph`, start wiring, `pikku all --tsc-summary`, stub
grep, report); every addon or stub adds one to three.

## Agent Operating Procedure

1. Discover before editing. Prefer `pikku meta ... --json` when
   available; inspect only the focused output you need.
2. Identify the source file that owns the behavior. Do not start from generated
   output, `.pikku`, `node_modules`, or vendored packages.
3. Make the smallest source change that satisfies the task. Keep generated files
   generated.
4. Validate with the narrowest relevant command first, then `pikku all` when
   functions, wirings, or schemas changed.
5. If validation fails, fix the source cause and rerun. Never edit generated
   files to hide an error.

## Workflow

### 1 — Run the importer (do as much as possible, cheaply)

```bash
pikku import n8n <file> [--out <dir>]   # -o for short
```

The output directory is an **option**, not a positional argument; omitted, it
falls back to `scaffold.functionDir` from `pikku.config.json`, then cwd.

`<file>` is one export, **or a directory** — the command reads every `.json` in
it — and either form may hold a single workflow object, a bare array (`n8n
export:workflow --all`), or a `{ workflows: [...] }` wrapper. All of those are
flattened into one import per workflow, so there is no need to loop yourself.

It writes `<slug>.graph.ts` (+ `.agent.ts` for AI workflows), `<slug>.addons.gen.ts`,
a `<slug>.integrations.json` manifest, and one stub function per node it could not
map. An un-importable workflow (a cross-workflow sub-workflow reference, a dynamic
workflow target, a mid-flow `respondToWebhook`) is reported as `[reason] message`
and **skipped** — nothing partial is written for it. Across a batch the others
still import; the command exits 1 at the end if any failed, so read the log rather
than the exit code to know what landed. Relay every skipped workflow to the user.

### 2 — Triage what it left

Every unmapped node is a stub that throws `… — implement me`. Classify each by its
JSDoc marker and route to the matching reference:

| Stub marker / signal                                                      | Handle via                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `STUB — generated from n8n node "…" (type "n8n-nodes-base.<svc>…")`       | `references/addon-mapping.md`                                                                                  |
| `STUB — generated from n8n Code node "…"`                                 | `references/code-translation.md`                                                                               |
| A `control` stub — Loop Over Items / **splitInBatches**, Switch expr-mode | `references/loops-and-control.md`                                                                              |
| `STUB — … vector-store … #902`                                            | rare now (RAG ships as `<store>:query`/`:ingest`); a residual one = an unmapped store → report it, don't guess |
| Importer `diagnostics` (already exited 1)                                 | explain the reason; the workflow is un-importable as-is                                                        |

Read a reference file only when you actually hit that stub class.

### 3 — Fill each stub

Work the manifest + stub files per the routed reference. The mechanical classes
(addon, code) are near-deterministic; the loop/control class needs judgment
(map vs reduce, done-branch semantics) — reference `loops-and-control.md` tells you
when to decide vs ask.

### 4 — Report missing integrations (first-class output)

An addon stub can only be wired to an **installed** `@pikku/addon-*`. When the
package for an n8n service is not in `dependencies`, do not guess a lookalike —
collect it. Give the user one upfront list:

```
Missing integrations — install these or the nodes stay stubs:
  • slackTool "Post to channel"   → npm i @pikku/addon-chat-slack
  • hubspot "Create contact"      → no @pikku/addon-hubspot exists yet
```

### 5 — Verify it works

1. `pikku all --tsc-summary` (regenerate + type-check); fix the source
   cause of any error and rerun.
2. Grep the emitted functions for any surviving `— implement me`
   / `throw new Error('Stub:`. **Any survivor means the import is not done** —
   list them by node name.
3. Green tsc **and** zero surviving stubs = success.

## References

| Open when you need to…                                                                                            | Read                              |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| map an integration stub (gmailTool, slackTool, googleSheets, plain action nodes) to an installed addon `ref(...)` | `references/addon-mapping.md`     |
| translate an n8n Code node body into a Pikku function body                                                        | `references/code-translation.md`  |
| lower a Loop Over Items / splitInBatches loop, or a Switch that stayed a stub                                     | `references/loops-and-control.md` |

## Final summary

Report, terse:

- Files written and workflow shape (`pure-graph` / `agent`).
- Stubs filled, by class.
- **Missing integrations** (the step-4 list) — the thing the user must act on.
- Anything left as a `// TODO:` and why (credentials to wire, a loop deferred, an
  unmapped store).
- Verification: `tsc` status + surviving-stub count (must be 0).
