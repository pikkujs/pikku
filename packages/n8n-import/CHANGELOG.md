# @pikku/n8n-import

## 0.0.3

### Patch Changes

- 2a7d9b0: Lower n8n expressions nested inside array/object parameters instead of emitting them raw

  `classifyExpression` only inspects strings, so a parameter holding an expression
  inside a container — `recipients: ["={{ $json.body.email }}"]` — classified as a
  literal and the raw expression string was emitted verbatim into generated code.
  `emitValue` now recurses element-wise into containers that carry an expression,
  lowering each member to `ref()`/`template()`. Containers with no expression
  inside keep the original `safeJson` path, so existing emissions are unchanged.

  Also exports the naming helpers (`sanitizeIdentifier`, `integrationRpcName`,
  `codeRpcName`, …) so a second importer normalizing onto the same IR emits
  identical identifiers and can share a project without colliding.

## 0.0.2

### Patch Changes

- cb079cc: Rename the `graph:map` addon function (and its `Map*` types) to `graph:fanout`, which better names invoking a child RPC once per element and collecting ordered results.
- cb079cc: The n8n importer now wires `ai_tool` integration nodes to their per-service addon RPC (e.g. `gmailTool` → `gmail:messageSend`) in the agent's `tools`, instead of emitting a throwing stub.
- cb079cc: Map n8n's Aggregate `aggregateAllItemData` mode onto `graph:aggregate` (new additive `includeAllItems` flag), converting ~164 previously-stubbed Aggregate nodes into real graph functions.
- cb079cc: Promote a lone n8n LangChain chain node to a tools-less `pikkuAIAgent` (with a structured `output` schema where the type defines one) instead of a throwing stub.
- cb079cc: Authenticated n8n HTTP Request nodes (generic header/basic/query + predefined API-key credentials) now map to a runnable `graph:httpRequest` with an auth descriptor resolved at runtime; OAuth2/custom auth stay stubs.
- cb079cc: Map the dep-free n8n `extractFromFile`/`convertToFile`/`moveBinaryData` operations onto the new `@pikku/addon-binary` addon instead of throwing stubs.
- cb079cc: A LangChain chain node alongside a real Agent node is now promoted to its own tools-less agent (wired as two distinct agents) instead of staying a stub.
- cb079cc: Code-node translation now falls back to a throwing stub when the n8n JavaScript is valid JS but not valid TypeScript syntax (octal literals, stray HTML comments), avoiding a hard `tsc` parse failure.
- cb079cc: Translate self-contained n8n Code/Function nodes into real Pikku functions (with a rebuilt `$input`/`$json`/`items` shim); nodes reaching outside themselves stay stubs.
- cb079cc: Lower Set / Edit Fields nodes with computed fields into real generated functions instead of dropping the field to a `// TODO(n8n expr)` comment, cutting dropped expressions from 1382 to 223.
- cb079cc: Map n8n convertToFile's `toBinary` operation onto `binary:moveBinaryData` (jsonToBinary mode) instead of a throwing stub.
- cb079cc: Lower more n8n cross-node references (`$('X').first().json.<path>`, bare `$('X').json.<path>`, `$node[...].item`) to declarative `ref()`, removing 92 dropped expressions across the corpus.
- cb079cc: Collapse duplicate n8n header/query param names last-wins in `emitParamObject`, clearing the TS1117 duplicate-key compile errors across the corpus.
- cb079cc: Map n8n's executeCommand node onto `execution:execute` (`@pikku/addon-execution`), capturing stdout/stderr/exitCode, instead of a throwing stub.
- cb079cc: Expand the `httpAuthRecipe` predefined-credential table from 5 to 31 entries (qdrantApi, stripeApi, githubApi, anthropicApi, …) so more authenticated `httpRequest` nodes emit a runnable `graph:httpRequest`.
- cb079cc: Map n8n's Merge `append` mode (and mode-less Merge default) onto a new `graph:concat` addon function that flattens all input streams, converting ~103 previously-stubbed Merge nodes.
- cb079cc: Support multiple LangChain chain nodes per n8n workflow, importing them as a graph of N distinct tools-less agents instead of leaving all but one as stubs.
- cb079cc: `parseN8n` takes an optional `nameHint` and the `pikku import n8n` CLI passes the source filename, so nameless n8n exports no longer all collapse onto the same `importedWorkflow` slug.
- cb079cc: Fix two corpus type-check failures: n8n `graph:sort`/`graph:summarize` enum rows now emit `as const`, and the inspector's `sanitizeTypeName` prefixes an underscore when a name starts with a digit.
- cb079cc: Map the base n8n `openAi` node's text/chat/completion path onto a tools-less `pikkuAIAgent` (model read inline from the node), replacing the previous mapping to a nonexistent `@pikku/addon-openai`.
- cb079cc: Import n8n RAG flows (v1) — retrieval-as-tool, chainRetrievalQa, and ingestion — as runnable vector-store addon calls driven by a new `rag-map`, plus a new `graph:splitText` builtin.
- cb079cc: Lift a self-referencing n8n `toolWorkflow` into its own `pikkuWorkflowGraph` referenced via `workflows: [ref(...)]`, instead of a broken `tools: [ref(<graph>)]`.
- cb079cc: The n8n coverage harness now classifies by-design-unimportable workflows (instance-local sub-workflow refs, mid-flow `respondToWebhook`) as a distinct `skipped` outcome via a typed `UnsupportedTopologyError`, separate from real failures.
- cb079cc: Normalize legacy (v1) n8n Switch nodes onto `graph:branch` (one case per rule) instead of control-flow stubs, converting ~50 previously-stubbed Switch nodes.
- cb079cc: Convert static n8n `toolHttpRequest`/`httpRequestTool` agent tools into real `pikkuSessionlessFunc` tools performing the configured `fetch` (with `httpAuthRecipe` auth); dynamic-URL or OAuth2 tools stay stubs.
- cb079cc: Add `@pikku/n8n-import` and the `pikku import n8n <file>` CLI command, converting an n8n workflow JSON export into a Pikku workflow graph plus a coverage harness.
