# Workflow Engine Import — Research & Recommendation

**Date:** 2026-07-16
**Question:** Which workflow engines besides n8n can we import from, following the `@pikku/n8n-import` concept?

**Verdict: Make first** (revised — see §4c). Activepieces is a close second and remains the choice if ToS exposure is unacceptable.

> **Revision history.** This doc first recommended **Activepieces**, on two claims that did not survive measurement: (a) "~55% catalog overlap, better than Make" — an artifact of measuring against AP's full 723-piece catalog; real-usage coverage is **47%**, a tie with Make's 46% and worse on weighted (74% vs 82%). (b) "Activepieces has no corpus" — false; `cloud.activepieces.com/api/v1/templates` serves **420 templates unauthenticated**.
>
> Also corrected en route: Zapier *does* have an official JSON export (§4); Make's routers are **sequential, not parallel** (§4).
>
> **Every error ran the same direction — pessimism toward options not being advocated.** Weigh the final call accordingly.

---

## 1. What n8n-import actually is

Pipeline: **parse export JSON → normalized IR (roles) → topology DAG → expression classifier → integration map → codegen**.

Module sizes (`packages/n8n-import/src`, 15,216 lines total):

| Module | Lines | Engine-specific? |
|---|---:|---|
| `integration-map.ts` | 7,605 | ✅ Fully — n8n node-type keys |
| `codegen.ts` | 1,636 | ❌ Nearly clean (one `__rl`, one `fixedCollection`) |
| `parse-n8n.ts` | 455 | ✅ Fully |
| `native-map.ts` | 452 | ✅ n8n idioms (`fromRL`, `fixedCollection`) |
| `branch.ts` | 196 | ⚠️ Mostly |
| `topology.ts` | 193 | ❌ Reusable concept |
| `expressions.ts` | 192 | ✅ Syntax; ❌ the IR it emits |
| `types.ts` | 179 | ⚠️ IR reusable, n8n types not |
| `http-auth-map.ts` | 164 | ❌ Recipe table reusable |
| `credentials.ts` | 164 | ⚠️ |
| `naming.ts`, `output-schema.ts` | 221 | ❌ Reusable |

### The two load-bearing insights

**1. The `ClassifiedExpression` IR is the engine-agnostic seam.**
```ts
type ClassifiedExpression =
  | { kind: 'literal';   value: unknown }
  | { kind: 'ref';       nodeId: string; path?: string }
  | { kind: 'template';  parts: string[]; refs: RefPart[] }
  | { kind: 'transform'; expression: string }
```
Every engine's expression language just needs a new classifier targeting these four tiers. This already exists and is correct.

**2. The value is the right-hand side of `integration-map.ts`, and it's portable.**
The table maps `n8n type + resource + operation` → `google-drive:filesGet`. For a second engine you rewrite the **keys** and keep the **targets**. That's why integration identity in the source format is the decisive selection criterion — not graph shape.

### Caveats about our own code

- `@pikku/addon-graph` primitives are *themselves* n8n: `splitOut`, `removeDuplicates`, `renameKeys`, `summarize`, `stopAndError`, `limit`, `sort`, `aggregate`, `dateTime`, `crypto`, `wait`. A second engine will pressure this vocabulary.
- The 216-addon catalog mirrors n8n's connector long tail (Mautic, Vero, Uproc, Peekalink, Mocean, Egoi).
- **`$fromAI` is a known deferred gap.** `http-tool.ts:45` treats any `$fromAI` param as non-static and emits a throwing stub — comment calls the LLM-filled input schema "a v2 concern." An n8n tool's parameter schema is never declared in one place; it's synthesized from `$fromAI()` calls scattered across parameter expression strings.
- The harness (`harness/run.ts`) runs a corpus through parse → codegen → tsc, classifying clean/partial/failed. **Corpus availability is a first-class selection criterion.**

---

## 2. Recommendation: Activepieces

**Why it wins on the only criterion that matters — integration mapping value:**

- **`pieceName` + `pieceVersion`** is a near-exact analogue of n8n's `type` + `typeVersion`. `integration-map.ts` is already keyed on that shape.
- **723 pieces**, all MIT.
- **104 of our 216 addons have an exact normalized-name counterpart** — and that undercounts (our `aws-s3`/`aws-ses`/`aws-sns`/`aws-sqs`/`aws-lambda` land on their `amazon-*`). Real overlap ≈ **55%**.
- **License verified firsthand.** Root `LICENSE` grants MIT Expat to everything outside `packages/ee/`; there is **no separate LICENSE under `packages/pieces/`**. This **refuted my prior** that the catalog was carved out.

**Known costs (all bounded):**

- Flow is a `nextAction` **linked chain**, not a DAG. `ROUTER` nests via `children[]`; `LOOP_ON_ITEMS` via `firstLoopAction`. → rewrite `topology.ts` (193 lines, the small one).
- `{{step.field}}` is parsed by a **custom brace tokenizer, not real Mustache**, despite the `mustache-utils.ts` filename. → bespoke lexer.
- Schema is at `LATEST_FLOW_SCHEMA_VERSION = '22'` and **has already broken once** (BRANCH → ROUTER).
- UI export documented only in a [community post](https://community.activepieces.com/t/flow-import-export-support-files-and-zip-format/6826), not `/docs`. API: `GET /v1/flows/{id}`.

**The open risk — and the reason to spike:** whether `ROUTER` / `LOOP_ON_ITEMS` lower cleanly onto `graph:branch` / `graph:fanout`. Make's routers famously don't (see below). No further research answers this; only a spike against real flows does.

---

## 3. Full engine matrix

| Engine | Export | Topology | Integration identity | Legal | Verdict |
|---|---|---|---|---|---|
| **Activepieces** | ✅ JSON | ⚠️ Linked chain | ✅ `pieceName`+`version`, 723 MIT pieces | ✅ MIT (verified) | **BUILD** |
| **Make** | ✅ Blueprint UI + API | ⚠️ Nested `flow[]`/`routes[]`; routers = **sequential gated fan-out** (§4) | ✅ `facebook-pages:CreatePost`+`version` | ⚠️ ToS competitive-use | Commercial play — risk lower than first assessed |
| **Power Automate** | ✅ Public MIT JSON Schema | ✅ `runAfter` labeled DAG | ✅ `apiId`+`operationId` | ✅ Cleanest commercial | Enterprise play |
| **Dify** | ✅ DSL YAML | ✅ Real DAG | ⚠️ 653 tools but **opaque plugins** | ✅ Apache-2.0+2 conditions | Second (AI track) |
| **Flowise** | ✅ JSON (double-encoded) | ✅ Real DAG | ⚠️ ~40–70 tools, readable TS | ✅ Apache-2.0 (not `enterprise/`) | AI track first step |
| **Node-RED** | ✅ Flat array | ✅ Real edges | ❌ **Unnamespaced, 1,990 collisions** | ✅ Apache-2.0 | **SKIP** |
| **Zapier** | ⚠️ All-Zaps, undocumented | ❌ No edges, order implicit | ❌ `selected_api` ≠ API id | ❌ ToS §4(b)(v) | **SKIP** |
| **Windmill** | ✅ OpenFlow | ⚠️ Ordered modules | ❌ **No registry at all** | ⚠️ AGPL core / **Apache-2.0 spec** | SKIP (no integrations) |
| **Kestra** | ✅ YAML | ⚠️ Only `Dag` task has edges | ⚠️ FQCN, **not version-stable** | ✅ Apache-2.0 | Tier 2 |
| **Langflow** | ✅ JSON | ✅ Real DAG | ❌ **Composio proxy, single-digit native** | ✅ MIT | **SKIP** |
| **Step Functions** | ✅ ASL JSON | ✅ `Next`/`Choices` | ❌ AWS ARNs only, no SaaS | ✅ Spec public | SKIP |
| **Automatisch** | ⚠️ Source-only, undocumented | ⚠️ Mostly linear | ⚠️ `appKey`, ~80 apps | ⚠️ AGPL | SKIP |
| **Workato** | ✅ `GET /api/recipes/:id` | ⚠️ Nested `block[]` | ✅ provider+name+keyword | ❌ **Worst — bans benchmarking** | SKIP |
| **Tray** | ✅ UI; API Embedded-only | ✅ `steps_structure` | ✅ connector+operation | ⚠️ MSA §2.3(vi) | SKIP |
| **Pipedream** | ⚠️ Schema **unpublished** | ❌ Linear; **no control-flow export** | ✅ `slack-send-message@0.1.1` | ❌ Registry bans competing use | SKIP |
| **Retool** | ✅ UI JSON | ⚠️ `blockData`+edges | ⚠️ Undocumented | ⚠️ MSA §3.3(h) | SKIP |
| **Rivet** | ✅ YAML v4 | ⚠️ String edges | ❌ Zero integrations | ✅ MIT | Dead (last human commit 2025-08-20) |
| **Sim** | ✅ **JSON, not YAML** | ✅ blocks+edges | ⚠️ ~230–240 real (not "1,000+") | ⚠️ Apache-2.0, `ee/` no-derivatives | SKIP |
| **Bedrock Flows** | ✅ JSON | ✅ **Typed `Conditional` vs `Data`** | ❌ AWS only | — | Prior art only |
| **Temporal / Airflow / Dagster / Prefect** | ❌ | — | — | — | **The workflow *is* code** |
| **BPMN / Camunda** | ✅ XML | ✅ Cleanest edge list | ⚠️ Camunda 8 license unverified | ⚠️ | Tier 2 |

---

## 4. Findings that change the build

### Zapier — my prior was refuted
Zapier **does** have an official documented JSON export: Settings → Security and data → Data management → "Download my Zap workflows," available Free through Enterprise ([help article](https://help.zapier.com/hc/en-us/articles/8496308481933-Import-and-export-Zap-workflows-in-your-Team-or-Enterprise-account), updated 2026-05-29). But: **all-or-nothing** (not per-Zap), **schema undocumented**, **no edges** (order implicit), **no expression language** (just `{{NodeID__Field}}` tokens). Zapier MCP / Agents give nothing machine-readable — all 15 meta-tools execute actions.

### Node-RED is a trap
Wins on format (flat array, `wires[i]` = target ids for output port `i`), license (Apache-2.0, OpenJS Foundation), and corpus. Loses on the only thing that matters:
- Type ids are **bare unnamespaced strings** (`mqtt out`, `publish`). The flow JSON **does not record which npm module a node came from**.
- Live catalogue: **6,132 modules declaring 17,928 node types; 1,990 type ids claimed by >1 module** (`lower-case` by 23 packages, `socketio-config` by 14).
- **Config-node references are indistinguishable from plain string values** (`"broker": "241f674b.fabaa8"`) — unresolvable without each package's `.html` editor schema.
- Core is only **49 node types**; ~99.7% of the palette is community.
- Ecosystem is IoT/MQTT-shaped → poor overlap with our SaaS addon catalog.

### Make's routers are not branches — they're gated fan-out, executed sequentially

**Corrected 2026-07-16.** An earlier draft of this doc claimed routes fire "in parallel." **That was wrong** (agent-sourced, repeated unverified). [Make's docs](https://help.make.com/router) state plainly:

> "Routes are processed sequentially, not in parallel. Make won't process the second route unless it finishes processing the first one."

Route order is user-configurable (right-click → "order routes"), and route 1's **entire downstream chain** completes before route 2 begins.

**Correct semantics:** one bundle → every route whose filter passes runs, **non-exclusively**, **in route order**, and routes **cannot merge back** (each is an independent terminal chain).

**Correct lowering — no new primitive needed.** `branch.ts` already documents the gate we need:
> "Filter: slot 0 = kept (no fallback — a false result dead-ends)."

So a router → **N independent Filter-shaped branch nodes**, each fed `ref(routerPredecessor)`, each dead-ending when its condition fails. Reuses the existing lowering path.

**Two wrong lowerings, in opposite directions:**
- `graph:branch` (exclusive, one-winner) → drops routes that should have fired.
- `Promise.all` / concurrent fan-out → introduces concurrency Make doesn't have.

**`graph:fanout` is the wrong primitive.** Per `fanout.ts`, it maps *one rpc over N items*; a router is *N chains over one item* — the transpose.

**The real remaining risk — ordering.** Pikku's graph would likely run N independent gated chains **concurrently** (nothing connects them). Route order is observable whenever routes touch shared state (route 1 creates a record, route 2 updates it). Options: emit an explicit sequencing edge (route N's gate depends on route N-1's completion), or accept concurrency and surface an `ImportDiagnostic`.

**Verdict: not a semantic trap — a sequencing rule.** Downgrades Make's risk materially.

**Still true:** structure is nested (`flow[]` + `routes[].flow[]`), not a DAG.

### The AI cluster has an ugly inversion
The only AI engine with a real SaaS catalog (Dify, 653 tools) is the one where **the schemas aren't in the file** — all 653 are out-of-process plugins; a `tool` node serializes only `provider_id`/`tool_name` + an untyped param bag. Dify also only exports a graph for **2 of its 8 app modes** (`workflow`, `advanced-chat`).

Langflow is **not an integration play at all**: the entire `slack_composio.py` is four lines declaring `app_name = "slack"`. Slack/Jira/GitHub/Linear/Airtable/Discord/Google Sheets are Composio stubs; Salesforce/HubSpot/Stripe/Twilio don't exist. **Our 216 addons are strictly better than Langflow's catalog.** It also embeds full Python source per node (`template.code`, ~37,800 chars for the stock Agent) and `exec()`s it unsandboxed (GHSA-vwmf-pq79-vjvx, CVE-2026-33017, CVE-2026-5027).

Flowise is the best *learning* target on the AI track: **64 in-repo versioned flow JSONs** (24 chatflows + 14 agentflows + 13 agentflowsv2 + 13 tools), readable in-repo TS schemas, **JS-only code nodes** that port to a TS runtime. But V1 (everything is an edge) and V2 (everything inlined, tools as array) are architecturally opposite = **two importers**.

### Legal pattern across commercial platforms
Every one pairs "you own your workflows" with "you may not access the Service to build a competing product." **Risk-minimizing architecture: the user exports their own file and hands it to us; our code never touches their platform.** That reframes "accessing the Service" as "parsing a file."

- **Worst:** Workato — additionally bans "benchmarking, comparative or competitive purposes," and binds *the user*, not just us.
- **Precedent:** [migromat.com](https://migromat.com/) sells Make→n8n conversion commercially, no visible enforcement.

### n8n's own license — resolved, we're fine
n8n ships under the **Sustainable Use License**; GitHub reports `NOASSERTION`. **n8n is not open source.** But the SUL restricts *the software*, and exported workflow JSON is *user data*. n8n's own docs list as **ALLOWED**: *"Creating an n8n node for your product **or any other integration between your product and n8n**."* Real constraints: don't vendor n8n source, never touch `.ee.` files, don't market with the trademark. Type strings and JSON shapes are interface facts.

### Cross-cutting: budget for the payload, not the topology
Nearly every candidate has near-identical graph topology. The difficulty always lives elsewhere:
- **Credentials are stripped on export** in Node-RED, Dify, Flowise, Langflow → all need a re-binding step (our `credentials.ts` + `http-auth-map.ts` generalizes).
- **RAG/knowledge content referenced by opaque ID** everywhere → dangling pointers are unavoidable; surface as `ImportDiagnostic`, not a broken emit.
- **Build version detection before schema work.** Dify declares `CURRENT_APP_DSL_VERSION = "0.7.0"` against 0.6.x files in its own repo; Langflow starters stamp `last_tested_version: 1.8.0` against a 1.10.2 runtime; Flowise stamps a float `version` per node; Activepieces is at schema v22 and already broke once.

---

## 4b. Make — measured (2026-07-16)

### Corpus & legal: solved
- **`integromat/make-skills` is Make's OWN org, MIT (`Copyright (c) 2026 Make`), actively pushed.**
- Ships **10 popular-template blueprints** + a **blueprint format spec under MIT**: `blueprint-construction.md` (30KB), `routing.md`, `filtering.md`, `mapping.md`, `iterations.md`, `merging.md`, `aggregations.md`. **This is a documented spec, not reverse engineering.**
- Make also runs a **public template library** (`make.com/en/templates`) with fetchable blueprints via `public-templates_list` / `public-templates_get-blueprint` (MCP — needs a token, so that path *does* touch the Service).
- Community blueprints are abundant on GitHub.
- **This dissolves the corpus/ToS problem.** Earlier draft claimed sourcing a corpus required a Make account. False — vendor MIT corpus + user-published data. Only an API-pull connector still touches the Service.
- Note: `make.com` returns **403** to scripted fetches (bot-protected). Don't scrape; use GitHub.

### Format (verified from a real blueprint)
```json
{ "blueprint": { "flow": [...], "metadata": {} }, "controller": {}, "scheduling": {}, ... }
```
```json
{ "id": 2,
  "module": "google-email:ActionSendEmail", "version": 2,
  "mapper": { "to": ["{{1.`0`}}"], "subject": "{{1.`1`}}", "html": "{{1.`2`}}" },
  "metadata": { "parameters": [{ "name": "account", "type": "account:google-restricted" }] } }
```
**Better than n8n in three ways:**
1. `module` is a **single `service:operation` string** — flatter than n8n's `type`+`resource`+`operation` triple, and already in our rpc namespace shape.
2. Refs are `{{1.\`0\`}}` — **numeric module ids → rename-safe**. n8n's name-keyed connections are not.
3. `mapper` is exactly the 1:1 field map `NativeFieldSpec` was built for; `parameters` (config) is cleanly split from `mapper` (data).

`metadata.parameters[].type` (`account:google-restricted`) types the credential binding → `credentials.ts`.

### Router — ground truth
```json
"module": "builtin:BasicRouter",
"routes": [ { "flow": [ { "id": 3, "module": "google-calendar:createAnEvent",
      "filter": { "name": "Doesn't Exist",
        "conditions": [[ {"a": "{{1...Status.name}}", "b": "Scheduled", "o": "text:equal"} ]] } },
    { "id": 4, "module": "notion:updateADatabaseItem", "filter": null } ] }, ... ]
```
- Each route = `{flow: [...]}`; the route's **head module carries a `filter`** — that's the gate. `filter: null` on the rest.
- `conditions: [[...]]` = **OR of ANDs** → maps onto `BranchSpec.cases[].combinator` directly.
- `{a, b, o}` → `RawCondition {left, right, operation}`; `o: "text:equal"` splits type+operation exactly like n8n v2's `operator: {type, operation}` → reuse the `V1_OPERATION` translation-table pattern.
- **`filter` sits on modules, not routes** — any module can be gated. Make's filters are edge-level, more general than routers.
- `builtin:BasicFeeder` = iterator → a genuine `graph:fanout`.

### Catalog coverage (237 real blueprints mined from GitHub)

| Measure | Result |
|---|---|
| Distinct apps seen | **115** (18 builtins + 97 real integrations) |
| Distinct `app:operation` | **377** |
| Covered by a pikku addon (distinct) | **45/97 = 46%** |
| **Covered, weighted by real usage** | **988/1,199 = 82%** |

**"3,000 apps" is marketing** — same inflation as n8n's "1946" (real 440) and Sim's "1,000+" (real ~240).

⚠️ **The two overlap numbers are not comparable.** Activepieces' **55%** is catalog-vs-catalog name matching; Make's comparable figure is **46%**. Make's **82%** is usage-weighted — computable only because Make has a public corpus and Activepieces doesn't.

### The architectural surprise
**Builtins are 1,609 / 2,808 module instances = 57% of everything** (`builtin` 617, `util` 292, `http` 237, `gateway` 203, `json` 96, `regexp` 48).

→ **For Make, the long pole is `native-map` / `@pikku/addon-graph`, not `integration-map`** — the exact inverse of n8n. Make's builtins don't all have `addon-graph` equivalents, and that vocabulary is currently n8n's core node list. **This is where a Make importer's real cost sits.**

### Incidental catalog gap (independent of any importer)
Unmatched by usage: `gemini-ai` (26), `anthropic-claude` (7), `perplexity-ai` (5). We have `ai/openai` and `ai/ollama` but **no Anthropic and no Gemini addon**.

---

## 4c. Make vs Activepieces — measured head-to-head (2026-07-16)

Both measured against real corpora, same method, same alias/builtin handling.

| | **Make** | **Activepieces** |
|---|---|---|
| Corpus | 237 blueprints mined from GitHub + public template library | **420 templates** — `cloud.activepieces.com/api/v1/templates`, **no auth**, 3.9MB |
| Distinct integrations used | 97 | 96 |
| Covered — distinct | 45/97 = **46%** | 45/96 = **47%** |
| Covered — **weighted by usage** | **988/1,199 = 82%** | **1,333/1,811 = 74%** |
| Builtins share of all modules | 1,609/2,808 = **57%** | 986/2,797 = **35%** |
| Module/piece id | `google-sheets:watchRows` — flat `service:operation` | `@activepieces/piece-linear` + `pieceVersion` |
| Refs | `{{1.\`0\`}}` numeric → **rename-safe** | `{{step_1['job_id']}}` — step-name keyed |
| Topology | nested `flow[]` / `routes[].flow[]` | `nextAction` linked chain |
| Format spec | ✅ **MIT, vendor-published** (`blueprint-construction.md`, 30KB) | ⚠️ community post only |
| Legal | ⚠️ ToS competitive-use (avoidable via file-upload architecture) | ✅ **MIT, self-hosted, zero ToS** |
| Migration demand | **High** | Low |

**Decision: Make.** Once coverage is a tie, Make wins on format quality (flat id already in our rpc shape, rename-safe refs, router → existing `BranchSpec`), a **vendor-published MIT format spec** (better documentation than we had for n8n), and far larger migration demand.

**What Activepieces retains — and when to pick it instead:**
- **Zero ToS exposure anywhere** (parser, connector, *and* corpus). If counsel rules the competitive-use clause unacceptable, AP is the answer and the drop-off is small.
- **Materially lighter builtins burden** (35% vs 57%) — less `addon-graph` work.

**Top Make gaps by usage:** `gemini-ai` (26), `sellsy` (22), `apify` (20), `json2video` (10), `anthropic-claude` (7).
**Top AP gaps by usage:** `text-ai` (97), `pipedrive` (47), `telegram-bot` (39), `workable` (32), `firecrawl` (23), `perplexity-ai` (20), `jira-cloud` (20).

⚠️ Both weighted figures carry classification noise — the builtin/integration split is judgment (e.g. AP's `text-ai` may be a builtin AI helper, which would raise AP's weighted number). Treat 82% vs 74% as "Make somewhat better," not a precise gap.

---

## 5. Recorded disagreement

Two agents from other sessions (not spawned by this work, lacking the addon-catalog context) called Activepieces a **"structural reject"** — reason: recursive nested `nextAction` tree, no `edges` array, data edges only inside `{{step_1['job_id']}}` strings.

**Facts agreed. Conclusion rejected.** Their implicit criterion was "can I reuse my ReactFlow nodes+edges parser." Against our seams both objections invert:

1. **A linked chain is a degenerate DAG.** Synthesizing topology from `nextAction` is *easier* than parsing n8n's `connections` map (keyed by node *name*, then `[outputIndex][connectionIndex]`). `topology.ts` is the 193-line module, not the 7,605-line one.
2. **String-embedded data refs are the problem `expressions.ts` already solves.** n8n's `$node["X"].json.field` is *also* a data edge hiding in a string — that's why the four-tier IR exists. `{{step_1['job_id']}}` is a different regex against the same design.

One of those agents' top recommendation was "build the n8n importer first" — already done. Weight accordingly.

**What would actually change the recommendation:** Activepieces ROUTER/LOOP_ON_ITEMS failing to lower onto `graph:branch`/`graph:fanout`, the way Make's routers fail. That's the spike.

---

## 6. Next steps

1. **Audit Make's builtins first — not the integrations.** They're 57% of all module instances and the actual long pole. Enumerate `builtin:*` / `util:*` / `json` / `regexp` / `gateway` against `@pikku/addon-graph`'s current vocabulary (which is n8n's core node list) and size the gap. **This is the estimate that decides the project**, and neither the research nor the first recommendation had it on the board.
2. **Read Make's MIT spec before writing a parser** — `skills/make-scenario-building/blueprint-construction.md` (30KB) plus `routing.md`, `filtering.md`, `mapping.md`, `iterations.md`, `merging.md`, `aggregations.md`. Vendor documentation; don't reverse-engineer what's already written down.
3. **Spike the Make parser** on the mined corpus. Router lowering is already understood (§4b) — the open risks are `builtin:BasicAggregator` / `util:*` semantics and IML expression coverage.
4. **Extract the shared core** into `@pikku/workflow-import-core` *before* the second importer, not retrofitted: `codegen` + `naming` + `output-schema` + the `ClassifiedExpression` / `ParsedWorkflow` IR. Each engine then ships `parse` + `expressions` + `integration-map` + its own topology synthesis.
5. **Port the harness pattern** (parse → codegen → tsc; clean/partial/failed). Corpus sources — **Make:** 237 mined from GitHub + `integromat/make-skills` (MIT) + public template library; **Activepieces:** 420 via `cloud.activepieces.com/api/v1/templates` (no auth); Flowise ships 64; Langflow ships 42; Node-RED has `catalogue.nodered.org/catalogue.json`.
6. **Counsel question, in parallel:** can we ship an API-pull Make connector, or file-upload only? The parser and corpus are clean; only automated Service access is at issue. If the answer is unacceptable → **switch to Activepieces**, which costs ~8 points of weighted coverage and buys a lighter builtins burden.
7. **Unrelated catalog gap:** no Anthropic and no Gemini addon (`gemini-ai` is Make's #1 unmatched app by usage; `perplexity-ai` appears in both corpora).

---

## 7. Open / unverified

- Cloud ToS for Dify, Flowise, Langflow (self-hosted licenses are clear; hosted terms are not).
- Camunda 8's current license (Camunda License 1.0, source-available) — unverified.
- Automatisch "switched to Sustainable Use" rumor — flagged as **likely false**, unverified.
- Dagster/Prefect licenses verified only at search-summary level.
- Activepieces corpus availability — no in-repo example flows found; needs sourcing before a harness is viable.
- Every "competitive use" clause is a **counsel question, not an engineering one**.
