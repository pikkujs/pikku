# n8n → Pikku Import Specification

## Intent

Take an n8n workflow JSON export all the way to a compiling, stub-free, runnable
Pikku workflow. The `@pikku/n8n-import` package is treated as **frozen**: it does
the provable mechanical conversion and leaves everything it cannot prove as a typed,
throwing stub. This skill owns the end-to-end flow around it — run it, fill the
remainder with judgment, report gaps that need a human decision, and verify.

## Scope

In scope:

- Running `pikku import n8n` and triaging its output.
- Filling integration stubs (→ addon refs), Code stubs (→ function bodies), and
  loop/control stubs (→ `graph:map`/reduce/branch).
- Reporting missing `@pikku/addon-*` integrations as a first-class output.
- Verifying via `pikku all` + `tsc` + a zero-surviving-stub check.

Out of scope:

- Extending `@pikku/n8n-import` itself (it is frozen; do not add per-service tables
  or new compiler rules to it).
- Authoring workflows from scratch (`pikku-workflow`) or hand-written addon wiring
  unrelated to an import (`pikku-addon`).
- Inventing batching primitives or guessing ambiguous loop semantics — surface them.

## Users And Trigger Context

- Primary users: developers importing their own n8n workflows into a Pikku app,
  usually inside an agentic session.
- Common requests: "import this n8n workflow", "convert this n8n export to pikku",
  finishing `— implement me` stubs, wiring a `*.integrations.json` manifest.
- Should not trigger for: from-scratch workflow authoring, or addon wiring with no
  n8n import involved.

## Runtime Contract

- Required first action: run `pikku import n8n <export.json> [outDir]` (per file for
  a directory); relay any exit-1 diagnostic instead of scaffolding a partial.
- Required outputs: filled stubs, a missing-integrations list, verification status.
- Non-negotiable: never hand-edit generated files to hide a stub; map only to
  installed addons; zero surviving `— implement me` stubs at success.
- Bundled files loaded at runtime: `references/addon-mapping.md`,
  `references/code-translation.md`, `references/loops-and-control.md` — each only
  when its stub class appears.

## Source And Evidence Model

Authoritative sources:

- `@pikku/n8n-import` codegen (stub markers, manifest shape, `import-n8n` command).
- `@pikku/addon-graph` function contracts (`graph:map`/`fanout`, `branch`).
- Installed `@pikku/addon-*` source (function names verified by grep, never guessed).

Useful improvement sources: real imported workflows, harness coverage deltas,
addon catalogue changes.

Data that must not be stored: credential secrets, customer data, private ids beyond
what a manifest already records for reproduction.

## Reference Architecture

- `SKILL.md`: the run → triage → fill → report → verify workflow + router.
- `references/`: per-stub-class depth (addon mapping, code translation, loops/control).

## Validation

- Lightweight: `yarn tsc` from the package root after each fill.
- Deeper: `pikku all` regeneration; grep emitted functions for surviving stub throws.
- Acceptance gates: green tsc **and** zero surviving `— implement me` stubs.

## Known Limitations

- `splitInBatches` with `batchSize > 1` and reduce-style accumulators have no direct
  primitive — surfaced, not auto-converted.
- Missing addons block their nodes; the skill reports, it does not install.
- Cross-workflow sub-workflow references fail import at the package level.

## Maintenance Notes

- Update `SKILL.md` when the import command, stub taxonomy, or verify gates change.
- Update a reference when an addon convention, the `graph:map` contract, or a rubric
  changes.
- This skill supersedes the former `pikku-n8n-addon-map` and `pikku-n8n-code-translate`
  skills (folded into `references/addon-mapping.md` and `references/code-translation.md`).
