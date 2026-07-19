# n8n → Pikku import — technical report

_Status: **working and usable — not under active development right now.** This is
the orientation doc for anyone (human or AI) resuming the work. The
`@pikku/n8n-import` package and the `pikku-n8n-import` skill are functional today;
run them. Last measured 2026-07 against a 2,053-workflow real-world corpus
(`.corpus/workflows`, gitignored)._

## What this is

Importing n8n is split into two halves that compound instead of compete:

- **`@pikku/n8n-import`** — a **deterministic compiler** (`parse-n8n.ts` → `codegen.ts`),
  invoked by `pikku import n8n <export.json>`. It does the provable, mechanical
  conversion and leaves everything it can't prove as a **typed stub that throws at
  runtime**. Treat it as **frozen**.
- **`pikku-n8n-import`** — a **Claude skill** (`packages/cli/skills/pikku-n8n-import/`)
  that runs the compiler, triages the stubs, fills them with judgment, reports
  missing `@pikku/addon-*` integrations, and verifies (`pikku all` + `tsc` + zero
  surviving stubs).

The rule of thumb: **a rule the compiler writes shrinks the hole the skill has to
reason about.** Deterministic where it's provable and reproducible; skill where it
needs to read intent.

## Coverage (2,053 real workflows)

| Outcome | Count | % | Meaning |
| --- | ---: | ---: | --- |
| clean | 1,119 | 54.5% | compiles with zero stubs — runnable as-is |
| partial | 832 | 40.5% | compiles, but ≥1 stub needs the skill to fill |
| failed | 10 | 0.5% | all malformed JSON (missing `nodes` array) — not our bug |
| skipped | 92 | 4.5% | external cross-workflow sub-flow ref (un-importable single-file) |

Every one of the 10 failures is a corrupt corpus file; the compiler itself produces
no crash-emitting output. Separately, **208** n8n expressions across **117**
workflows were too dynamic to lower and were preserved verbatim as `// TODO` markers.

## What the compiler automates

`parse-n8n.ts` classifies each node into a role, then `codegen.ts` emits it. Status
below is the compiler's own label per node type (`yarn harness`).

| Class | Mechanism | Example types (corpus count) | Status |
| --- | --- | --- | --- |
| Data / transform | native `@pikku/addon-graph` fns | set 2,448 · aggregate 240 · splitOut 402 · limit 67 | supported |
| HTTP | `graph:httpRequest` (+ static auth recipes) | httpRequest 2,093 | supported |
| Control flow | `graph:branch` (normalizable IF/Filter/Switch) | if 1,058 · switch 277 · filter 267 | supported |
| Integrations w/ an addon | `ref('<ns>:<fn>')` to installed addon | googleSheets 589 · telegram 389 · gmail 257 · slack 175 | supported |
| Agents / chains | `pikkuAIAgent` (+ tools/memory absorbed) | agent 457 · chainLlm 256 · informationExtractor 91 | supported |
| RAG retrieval | tool + chain → `<store>:query` | vectorStoreQdrant 82 | supported |
| RAG ingestion | synthesized `graph:splitText → <store>:ingest` | graphSplitText 85 (synthesized) | supported |
| Triggers / AI sub-nodes | absorbed (become the workflow trigger, or folded into an agent/RAG) | manualTrigger 769 · lmChatOpenAi 630 · embeddingsOpenAi 130 | skipped¹ |

¹ "skipped" ≠ dropped — triggers and model/memory/embedding sub-nodes are
intentionally not standalone graph nodes.

## What it can't automate (and who does)

| Stubbed class | Count | Why a rule can't | Handled by |
| --- | ---: | --- | --- |
| Code node | 988 | arbitrary JS — no static equivalent | skill → `references/code-translation.md` |
| Integration w/o installed addon | e.g. gmailTool 57, toolHttpRequest 142 | mapping needs the real addon surface | skill → `references/addon-mapping.md` |
| **splitInBatches** (Loop Over Items) | 279 | loop semantics need intent (see below) | skill → `references/loops-and-control.md` |
| Sub-workflow tool (`toolWorkflow`) | 178 | target/shape is judgment | skill / manual |
| `function` (legacy code) | 188 | same as Code node | skill → code-translation |
| HTML / form / misc | html 149 · form 86 | niche, low ROI to compile | skill / manual |

The compiler deliberately does **not** carry per-service tables — those live in the
skill. Adding a new addon needs **zero** compiler changes.

## Where the skill steps in

`pikku-n8n-import` owns the full flow (its `SKILL.md` is a router):

1. **Run** `pikku import n8n` — the frozen fast path.
2. **Triage** each stub by its JSDoc marker → route to a reference.
3. **Fill** — addon refs / code bodies / loop lowering.
4. **Report missing integrations** — never guess a lookalike; list `npm i @pikku/addon-*`.
5. **Verify** — `pikku all` + `tsc` + grep for surviving `— implement me` (must be 0).

Three references carry the depth: `addon-mapping.md`, `code-translation.md`,
`loops-and-control.md`.

## Biggest open lever: splitInBatches (279 stubbed)

Measured scoping (why this is a skill job, not a compiler epic):

| Cut | Count | Note |
| --- | ---: | --- |
| Total splitInBatches nodes | 282 | across 223 workflows |
| `batchSize = 1` | 249 (88%) | = per-item `graph:map`, not real batching |
| Loop body ≤1 node | 40 | trivially a single-node map child |
| Loop body 2–3 nodes | 79 | needs a per-item sub-graph child |
| Loop body 4+ nodes | 135 | needs a per-item sub-graph child |
| Provably-safe subset (clean 1-node body, **empty** done branch) | 10 | unambiguous `graph:map`, no `next` |
| Clean 1-node body, **passthrough** done branch | 26 | done-branch data semantics are version-dependent → guess |

The only guess-free deterministic subset is ~10 workflows — too little to justify
the sub-graph-child + rebind-boundary compiler work. **Recommendation: the skill
lowers loops with judgment** (map vs reduce, done-branch intent), using the existing
`graph:map`/`fanout` + `subWorkflowParsed` machinery. `batchSize > 1` (30 nodes) has
no primitive — leave stubbed.

## Resuming later

None of this is deprecated. The import works end-to-end today — the compiler for
the mechanical majority, the skill for the rest. This section is just the map for
picking the work back up when someone chooses to.

**Frozen / done:**
- Core roles, native-map, integration-map, branch, fanout, agents, sub-workflow lift.
- RAG retrieval (tool + chain) **and** ingestion (`graph:splitText` + `<store>:ingest`)
  shipped this session. 153 unit tests green; `yarn tsc` clean.

**Key source:** `src/parse-n8n.ts` (classification + splices), `src/codegen.ts`
(emission), `src/rag-map.ts`, `src/fanout.ts`, `src/subworkflow.ts`,
`src/native-map.ts`, `src/topology.ts`. Coverage harness: `yarn harness --dir .corpus/workflows`.

**Where the code lives:** the RAG-ingestion emission + branch tests are committed on
`feat/n8n-import`; the addon-side work (openai
`AIEmbeddingService` + qdrant/pinecone/supabase `query`/`ingest`) sits in
`/Users/yasser/git/pikku/addons`, blocked on the `@pikku/core` #948/#949 release.

**Next levers, in ROI order:**
1. splitInBatches via the **skill** (unlocks ~150–200 nodes without compiler work).
2. Publish the vector-store addons once `@pikku/core` ships `AIEmbeddingService`.
3. Grow the addon catalogue (demand-driven; each new addon = 0 compiler changes).
4. Everything ambiguous → the skill, graded by `tsc`. Do **not** grow the compiler
   into the semantic tail.

**Do not:** add per-service tables to the compiler; try to compile arbitrary Code
nodes; guess loop done-branch semantics.
