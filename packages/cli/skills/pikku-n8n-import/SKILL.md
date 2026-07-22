---
name: pikku-n8n-import
description: 'Use to import an n8n workflow JSON export into a runnable Pikku workflow. Triggers when the user says "import this n8n workflow", "convert this n8n export to pikku", points at an n8n `.json` export or a directory of them, or picks up after `pikku import n8n` left throwing stub functions (`STUB — generated from n8n …`, `— implement me`) or a `<workflow>.integrations.json` manifest. Owns the whole flow: run the importer, triage what it could not map, fill each stub, report any missing `@pikku/addon-*` integrations, and verify the result compiles and runs with no surviving stubs. DO NOT TRIGGER for hand-written addon wiring unrelated to an n8n import (use pikku-addon), or for authoring workflows from scratch (use pikku-workflow).'
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

## Agent Operating Procedure

1. Discover before editing. Prefer `pikku-meta`/`pikku meta ... --json` when
   available; inspect only the focused output you need.
2. Identify the source file that owns the behavior. Do not start from generated
   output, `.pikku`, `node_modules`, or vendored packages.
3. Make the smallest source change that satisfies the task. Keep generated files
   generated.
4. Validate with the narrowest relevant command first, then `pikku all` /
   `pikku-verify` when functions, wirings, or schemas changed.
5. If validation fails, fix the source cause and rerun. Never edit generated
   files to hide an error.

## Workflow

### 1 — Run the importer (do as much as possible, cheaply)

```bash
pikku import n8n <export.json> [outDir]
```

It writes `<slug>.graph.ts` (+ `.agent.ts` for AI workflows), `<slug>.addons.gen.ts`,
a `<slug>.integrations.json` manifest, and one stub function per node it could not
map. It **exits 1** on an un-importable input (a cross-workflow sub-workflow
reference, a dynamic workflow target, a mid-flow `respondToWebhook`) with a
`[reason] message` — relay that to the user; do not fake a partial scaffold.

For a directory of exports, run it per file.

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

1. `pikku all` (regenerate) → `yarn tsc` from the package root; fix the source
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
