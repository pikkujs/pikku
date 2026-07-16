# pikku-software-archaeology

Reverse-engineers an existing repository into a **Product Blueprint**: the product intelligence hidden inside an implementation (domains, entities, commands, queries, events, policies, workflows, invariants, integrations, gaps), extracted as schema-validated JSON that a generator — in our case Pikku — can rebuild from.

```
Existing Repository → pikku-software-archaeology → .knowledge/ blueprint → new Pikku application
```

This is **not** a code indexer or doc generator. It extracts *intent over implementation*: `POST /api/users/:id/status` becomes the command `ActivateUser`; three scattered `if (inv.user_id !== req.user.id)` checks become one `InvoiceOwnerOnly` policy with three `enforcedAt` citations.

## Design decision: the AI is the parser

There is deliberately **no scanner/AST tooling** in this skill. Static extraction is brittle and per-language (the first prototype's regex scanner broke before it ran once); the analyzing model already reads every language — JS, TS, Ruby, Python, PHP, Go — follows indirection, and understands intent. Determinism lives in the **output contract** instead: fixed file names, schema-validated shapes, sorted arrays, and stable concept names, all enforced by a dumb JSON validator (`scripts/validate.mjs`). The audit is expensive; that's the trade we chose.

## How to run it

In Claude Code, from (or pointing at) the target repo:

> Use the pikku-software-archaeology skill to extract a product blueprint from /path/to/repo

The agent then:
1. **Surveys** the repo (manifests, entry points, routes, jobs, webhooks, schema, config, TODO/HACK markers) — facts only.
2. **Excavates the test suite** — `describe`/`it` names become workflow scenarios; assertions confirm policies and upgrade confidence; rules that exist *only* in tests are captured.
3. **Extracts** through twelve lenses (domains, entities, commands, …) per the pipeline in `SKILL.md`. Large repos fan out subagents per lens and merge.
4. **Cross-checks and validates**:
   ```bash
   node .claude/skills/pikku-software-archaeology/scripts/validate.mjs <repo>/.knowledge
   ```
   The validator checks every file against `references/blueprint.schema.json` plus referential integrity across files (commands reference defined domains, api surfaces map to defined commands/queries, events have producers, …).
5. Writes `blueprint.md`, the human synthesis.

Output lands in `<repo>/.knowledge/` — 14 core JSON files + `blueprint.md` (see `SKILL.md` for the full listing). Repos with a frontend and/or non-HTTP consumer channels also get an **optional consumer-surface layer**: `interfaces.json` (every way the product is used — web UI, CLI, MCP server for AI agents, OpenAPI/REST, SDK, realtime, webhooks) plus `frontend.json` / `frontend-routes.json` / `frontend-components.json`. The frontend component inventory's `rebuild` field is the key output: it separates trivially-rebuildable standard components from the **custom-logic** pieces (charts, complex tables, editors) that must be carefully ported. Backend-only repos omit these and the validator does not complain.

### Incremental re-analysis

Concept names are the stable IDs. On re-run after code changes, re-extract only the affected lens/domain, diff against the existing `.knowledge/`, and leave unrelated entries verbatim. Arrays are sorted so diffs stay reviewable.

## How Pikku consumes the blueprint

Full mapping table in `references/pikku-mapping.md`. Summary: entities → Kysely migrations + Zod schemas; commands/queries → `pikkuFunc`s; api surfaces → `wireHTTP`; policies → shared permission functions (collapsing duplicated legacy checks); system workflows → `wireScheduler`/`wireQueueWorker`/`pikkuWorkflowFunc`; integrations → injected services with `wireSecret`/`wireCredential`; test-derived scenarios → `pikkuUserFlow` stories / e2e tests. Humans resolve `migration.json.decisionsNeeded` before any generation starts.

## How uncertainty is represented

Every extracted concept carries:

```json
{ "evidence": [{ "file": "controllers/invoices.js", "lines": "52", "note": "guard: only drafts editable" }],
  "confidence": "high" }
```

- **high** — the behavior itself is in the cited code/schema/test. Generates directly.
- **medium** — inferred from converging signals. Generates with a review marker.
- **low** — plausible reconstruction. Never auto-generated; surfaced for human review.

Two further distinctions keep facts and guesses separate:
- `events[].explicit: false` — the event was *reconstructed* from side-effect clusters (email + status flip), not emitted by the code.
- Comments/docs vs code: comments describe intent, code describes behavior. Disagreements are recorded as the code's behavior plus a `gaps.json` entry.

## Repo layout

```
pikku-software-archaeology/
├── SKILL.md                          # skill definition + extraction pipeline
├── README.md                         # this file
├── references/
│   ├── blueprint.schema.json         # the output contract (JSON Schema)
│   └── pikku-mapping.md              # blueprint → Pikku primitives
└── scripts/
    └── validate.mjs                  # schema + cross-file validation (node, no deps)
```
