# Plan: make imported n8n workflows run — reuse first, build the thin tail

## Why this exists

The n8n importer (`@pikku/n8n-import`) turns a workflow into a compiling Pikku
project, but every integration node currently lands as a **throwing stub**. This
plan replaces stubs with real wiring. The headline finding: **we already have
coverage for ~93% of node instances** — the job is mostly _wiring the importer
to existing capability_, not building new addons.

## Coverage reality (2,380-workflow corpus, 24,491 classified node instances)

Classified against all three existing coverage sources at once:

| Bucket               | distinct | instances |     share | how it becomes real                                             |
| -------------------- | -------: | --------: | --------: | --------------------------------------------------------------- |
| **NATIVE**           |       36 |    18,366 | **75.0%** | `@pikku/addon-graph` data-transforms + importer-emitted natives |
| **HAND-ADDON**       |       31 |     2,226 |      9.1% | reuse existing hand-crafted `@pikku/*` addons                   |
| **OPENAPI/registry** |       55 |     2,099 |      8.6% | reuse existing registry (OpenAPI-generated) addons              |
| **MISSING (build)**  |      199 |     1,800 |  **7.3%** | genuinely uncovered — the thin tail                             |

The prior draft of this plan put MISSING at 30%. That number assumed we'd
_re-port_ services that already have addons. The user decision — **"if the addon
exists we should just use the addon, why would we redo it?"** — collapses MISSING
to **7.3%**, and even that overcounts (see below).

### The MISSING 7.3% is still overcounted

Three groups sit in the MISSING list but need **no new addon**:

1. **AI / LangChain sub-nodes** — `chainLlm` (79), `documentDefaultDataLoader`
   (35), `textSplitterRecursiveCharacterTextSplitter` (27),
   `informationExtractor` (25), `mcpClient` (27), `toolWorkflow` (46). These
   **collapse into the `pikkuAIAgent` config** (model/memory/tools/output) or,
   for RAG, wait on **#902** — they are not integration addons.
2. **Native data / binary / exec ops** — `executeCommand` (42),
   `moveBinaryData` (38), `readBinaryFile`+`writeBinaryFile` (57),
   `executionData` (24), `compareDatasets` (22). Importer-emitted natives.
3. **Near-miss existing addons** — `emailReadImap` (34) → we have `imap`;
   `rssFeedRead` (39) → `rssfeed`; `htmlExtract` (19) → `htmlextract`. These are
   HAVE, missed only by the classifier's exact-name match.

Strip those and the genuine "no addon anywhere" tail is **~2 dozen SaaS
connectors**, most low-frequency: `microsoftOutlook` (86), `wordpress` (56),
`pipedrive` (51), `mattermost` (46), `zendesk` (34), `nocoDb` (32), `todoist`
(32), `baserow` (28), `dropbox` (23), `mautic` (23), `graphql` (22), `clockify`
(21), `clearbit` (17), `theHive` (17), `linkedIn` (17), `snowflake` (17)…

## Native handling (the 75%) — no addons, importer codegen

`@pikku/addon-graph` already implements the n8n **data-transform** family:
Set/Edit-Fields, Aggregate, Split-Out, Merge, Sort, Limit, Remove-Duplicates,
Rename-Keys, Pick/Omit, Summarize, Date-Time, Crypto, Math, JWT,
String-Transform, and Sleep (≈ n8n Wait). Imported nodes of these types map
straight to a `graph:*` RPC — no build.

The remaining natives are **importer-emitted**, not addons:

- **`httpRequest`** (2,546 — the single biggest node) → a real fetch-based body,
  params (method/url/headers/qs/body) taken 1:1 from the node.
- **Control flow — `if` / `switch` / `filter`** → a graph node with a `Record`
  `next` (`{ true: [...], false: [...] }` / one key per Switch output) and a
  generated **predicate function** that evaluates the n8n condition
  (`leftValue`/`operator`/`rightValue`, same 3-tier ref lowering as `input`) and
  calls **`graph.branch(key)`**. Filter is the predicate without the branch
  (drops non-matching items). These use the graph branch API — **never addons,
  never stubs**.
- **`respondToWebhook`, `stopAndError`, `wait`, `executeWorkflow`,
  `executeCommand`, file/binary ops** → importer-emitted native bodies (or a
  native ref where one exists, e.g. Wait → `graph:sleep`).

This native codegen is importer work, tracked here but implemented in
`@pikku/n8n-import`, not in any addon.

## Reuse (the 17.7%) — the addon-map step, no re-porting

For HAND-ADDON and OPENAPI/registry nodes the importer resolves
`n8nType + operation → existing @pikku/addon-<name>` RPC and emits a real
`ref('<addon>:<op>')` **instead of** a throwing stub. This is exactly the job of
the existing **`pikku-n8n-addon-map`** skill, run over the emitted
`integrations.json` manifest.

- OpenAPI-shaped addons need a per-operation param reshape (their operation IDs
  don't line up with n8n's), so the addon-map skill does more work per service —
  but reusing still beats rebuilding. **No addon is re-ported just because its
  shape differs.**
- Only nodes with **no** existing addon fall through to the build tail.

## Build (the thin tail, ≤ ~2 dozen) — n8n-shaped, by frequency, on demand

Only for services with no addon anywhere. Constraints (locked by the user):

- **Skip SDK-backed nodes** — keep raw-HTTP nodes only (matches the addons
  "fetch over SDKs" rule).
- **Latest node version only** (`SlackV2`, not V1).
- **Normal hand-crafted `@pikku` addon** (`pikku new addon`, fetch-based) — **not
  an OpenAPI addon** (confirmed with the user).
- **Cover n8n needs first**, add more later — build strictly by corpus
  frequency, highest first, on demand. No bulk pre-generation.

Tier by frequency (genuine-MISSING only): `microsoftOutlook` → `wordpress` →
`pipedrive` → `mattermost` → `zendesk` → `todoist`/`nocoDb`/`baserow` → long
tail. Each: port the declarative `routing` or the programmatic
`GenericFunctions.apiRequest` HTTP to a fetch function
(`pikku-n8n-code-translate` skill), `pikku all --tsc` + test, publish.

## Wire it back into the importer (what turns coverage into "runs")

1. **Native map** — importer emits real bodies / `graph:*` refs for the NATIVE
   set (transforms, httpRequest, control-flow predicates, file ops).
2. **Addon-map step** — for each `integrations.json` entry, resolve to an
   existing addon RPC (HAND or OPENAPI); emit `ref('<addon>:<op>')`.
3. **Stub only the true tail** — unmapped MISSING nodes (not yet built, or
   SDK-skipped) keep the throwing stub; the boot harness already distinguishes
   stub vs real.

## Verification / acceptance

- **End-to-end**: re-run the boot harness over the AI subset + a graph sample. A
  workflow whose nodes are all NATIVE + HAVE-addon boots with **zero throwing
  stubs**. Headline metric: "% of corpus node instances now real vs stub" — from
  ~0% (all stubs) toward **~93%** once native codegen + addon-map land, before
  building a single new addon.
- **Per-addon** (tail only): generated addon compiles + its test harness passes.

## Phasing (re-ordered — wiring before building)

- **Phase A — native codegen** (biggest win): importer emits real bodies for the
  NATIVE 75% — httpRequest, control-flow branch predicates, `graph:*` transform
  refs, file/wait/respond. No addons touched.
- **Phase B — addon-map reuse**: wire the `pikku-n8n-addon-map` step so HAND +
  OPENAPI nodes resolve to existing addon RPCs. Fix the near-miss matches
  (imap/rssfeed/htmlextract).
- **Phase C — AI sub-node absorption**: fold chainLlm/textSplitter/docLoader/
  informationExtractor into the agent config; RAG stubs reference #902.
- **Phase D — thin tail build**: `pikku new addon` for the ~2 dozen genuine
  MISSING services, by frequency, on demand — not a bulk migration.

## Open questions for you

1. **Credentials at runtime** — reused addons need real auth to _execute_ (vs
   register). Wire per-user credentials via the credential-linking design, or is
   "boots + returns real shape against a test credential" the bar?
2. **Phase A scope** — is httpRequest + control-flow the right first cut of
   native codegen, or should the transform-node `graph:*` mapping land first
   (it's the largest instance count and lowest-risk)?
