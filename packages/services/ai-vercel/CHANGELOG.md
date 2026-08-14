## 0.12.11

### Patch Changes

- 7406bfe: Rename the agent runtime from `AI*` to `Agent*` (#596)

  `AI` described the model provider, not the thing being named. Every symbol that
  belongs to the agent runtime now says `Agent`; the symbols that genuinely wrap a
  model provider — `AIEmbeddingService`, `AIProviderOptions`, `AIEmbedParams`,
  `AITranscriptionParams`, `AIGenerateImageParams` and their siblings, and the
  `@pikku/ai-vercel` / `@pikku/ai-deepinfra` / `@pikku/ai-voice` packages — keep
  their names.

  **Wiring**
  - `pikkuAIAgent` → `pikkuAgent`, `pikkuAIScorer` → `pikkuAgentScorer`,
    `pikkuAIJudge` → `pikkuAgentJudge`
  - `CoreAIAgent` → `CoreAgent`, `AIAgentInput` → `AgentInput`, `AIAgentStep` →
    `AgentStep`, `AIMessage` → `AgentMessage`, and the rest of the agent types
  - `AIAgentRunnerService` → `AgentRunnerService`, `AIStorageService` →
    `AgentStorageService`, `AIRunStateService` → `AgentRunStateService`

  **Entry points**

  `@pikku/core/agent` → `@pikku/core/agent`, `@pikku/core/agent-scorer` →
  `@pikku/core/agent-scorer`.

  **Queues**

  The scorer queues are now `agent-score-fast` and `agent-score-slow`. Drain the
  old `ai-score-fast` / `ai-score-slow` queues before deploying — jobs still
  sitting on them when the new workers start will never be picked up.

  **Scaffolds**

  The agent scaffold pikku wrote for your project — `<scaffold>/agent/agent.gen.ts`
  and its schemas file — imports `@pikku/core/ai-agent`, which no longer exists. A
  scaffold is normally written once and then left alone, so `pikku all` would find
  it present and leave the broken import in place. It now deletes an agent scaffold
  importing either removed entry point and regenerates it in the same run. Anything
  you added to that file goes with it, so move local edits out first.

  **Database**

  The agent tables are renamed: `ai_threads`, `ai_message`, `ai_tool_call`,
  `ai_working_memory`, `ai_run` and `ai_run_score` become `agent_threads`,
  `agent_message`, `agent_tool_call`, `agent_working_memory`, `agent_run` and
  `agent_run_score`, along with their indexes and the `ai_working_memory_pk`
  constraint. The same rename applies to the MongoDB collections.

  `ensurePikkuSchema` creates tables it cannot find, so an existing database will
  get empty `agent_*` tables and leave the old data stranded in `ai_*`. Rename
  them before the first boot on the new version:

  ```sql
  ALTER TABLE ai_threads        RENAME TO agent_threads;
  ALTER TABLE ai_message        RENAME TO agent_message;
  ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
  ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
  ALTER TABLE ai_run            RENAME TO agent_run;
  ALTER TABLE ai_run_score      RENAME TO agent_run_score;
  ```

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- a7fcd2e: Declare dependencies that were imported but missing from `package.json`

  `@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
  imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
  `@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
  resolved through Yarn hoisting inside the monorepo and would fail for anyone
  installing the package on its own.

  `rxjs`, `kysely` and `path-to-regexp` reach consumers through public
  signatures — `Observable<BaseEvent>` is the return type of a published method,
  and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
  dependencies rather than build-only ones.

  `@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
  pins, rather than a caret range. The two packages exchange `Observable`s, so a
  range that floats to a second copy gives them two incompatible `Observable`
  types.

  `@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
  `SerializePlugin` that has been marked `@deprecated` in favour of it. Use
  `SerializePlugin`.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.12.10

### Patch Changes

- 3ad2131: Name models by what they are for, and switch them all in one place

  A `models` table in pikku.config.json maps an alias to a provider-qualified
  model, so a declaration can say `model: 'cheap'` and the project repoints every
  use of that tier at once instead of editing each agent. A model containing `/`
  is still concrete and used exactly as written, which is how an agent that needs
  one specific model pins it — aliases are opt-in.

  The table is baked into codegen rather than read at runtime, so it applies to
  deployed units and not just local runs, and `pikku dev`/`pikku serve` take
  `--model cheap:openai/gpt-5-nano` to repoint a tier for one run without editing
  the config.

  Because the inspector already holds every agent's model literal, a bare name
  with no matching alias now fails the build (PKU146) naming the aliases that do
  exist, rather than reaching a provider as an unknown model.

  Aliases resolve for every modality, not just agents: image, speech,
  transcription, embedding and reranking all reach a provider through the same
  point in the Vercel runner.

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82

## 0.12.9

### Patch Changes

- e110c55: Give a finished agent run one finalization seam, and make a failed tool call
  distinguishable from a tool that returned text saying "Error:".
  - Tool results carry `error` as its own field, from the runner through the
    stream event and the run's step record into persisted messages.
  - `modifyOutput` receives the run's tool calls and may return a rewritten list,
    which is redistributed back onto the steps it came from.
  - Streamed runs accumulate their tool calls across steps, and every completion
    path — streamed, non-streamed, and resumed after a tool approval — now
    finalizes through `finalizeAgentRun`. A tool that fails after being approved
    leaves a record on the run instead of vanishing.

- e110c55: Emit `pikkuAIScorer` and `pikkuAIJudge` from the generated agent types so a
  project can declare scorers, and read a run's grades from the console.

  A tool that threw now reports its reason only on the step record's `error`; the
  result replayed to the model stays the generic `Error: Tool execution failed` it
  was before scorers needed the reason.

- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [acc8077]
- Updated dependencies [905f737]
- Updated dependencies [3cc6428]
- Updated dependencies [c524adf]
- Updated dependencies [e110c55]
  - @pikku/core@0.12.81

## 0.12.8

### Patch Changes

- 5f19016: Widen the generated agent HTTP surface, and guard attachment downloads against SSRF.

  `agentCaller` and `agentStreamCaller` declared only `message`, `threadId` and
  `resourceId` (plus `context` on the stream route), so `attachments`, `model`,
  `temperature` — all accepted by `AIAgentInput` — were unreachable over the
  shipped HTTP contract. No deployed app could send an attachment or a per-request
  model override. Both callers now share an `AgentCallerInput` type covering every
  optional field and forward each one to the RPC.

  Both callers declare that shape **inline** in the generic position rather than
  behind a shared named alias: the schema extractor only reads type literals there
  and synthesises the schema name from the function name. Behind an alias it
  records an `inputSchemaName` with no schema generated for it, and every agent
  HTTP call then fails at runtime with `MissingSchemaError`.

  Widening that surface makes caller-supplied attachment URLs reachable, which is
  an SSRF vector: the AI SDK downloads attachment URLs **server-side** whenever the
  model cannot consume them natively, using an unguarded `fetch`. A caller could
  point an attachment at the cloud metadata endpoint or another internal host and
  have the response relayed into the model's context. `VercelAIAgentRunner` now
  passes an `experimental_download` implementation backed by `safeFetch` (which
  refuses private/internal hosts and non-HTTP schemes, and re-validates every
  redirect hop) to both `streamText` and `generateText`. URLs the model supports
  natively are passed through untouched, so the provider still fetches those
  itself.

  The runner takes an optional `allowedAttachmentHosts` allowlist, carried across
  `withApiKey`. `safeFetch` is now exported from `@pikku/core/safe-fetch`.

- Updated dependencies [5f19016]
- Updated dependencies [78e4778]
- Updated dependencies [4324652]
- Updated dependencies [de044f8]
- Updated dependencies [cd1a811]
- Updated dependencies [19fa6f0]
- Updated dependencies [b501612]
- Updated dependencies [eb37b1e]
  - @pikku/core@0.12.66

## 0.12.7

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.6

### Patch Changes

- 6bca38f: Extend `aiAgentRunner` with AI SDK-style media methods for transcription, speech, image generation, embeddings, and reranking.

  Move `voiceInput` and `voiceOutput` into `@pikku/core/ai-agent`, backed by the injected `aiAgentRunner`.

  Deprecate `@pikku/ai-voice` and strip its exports.

- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.5

### Patch Changes

- c02275f: Add per-request API key override to AI agent runner

  `VercelAIAgentRunner` gains an optional `providerFactory` constructor param and a `withApiKey(apiKey)` method that forks a new runner scoped to a given key without touching the global singleton.

  `RunAIAgentParams` gains an optional `getCredential` accessor so callers can thread per-request credentials (e.g. a user's `AI_API_KEY` from the credential wire service) into `prepareAgentRun`. If a credential is found and the runner supports `withApiKey`, the runner is forked before the agent executes.

  `AIAgentRunnerService` interface gains the optional `withApiKey?` method.

- Updated dependencies [c02275f]
- Updated dependencies [0bd0433]
  - @pikku/core@0.12.24

## 0.12.4

### Patch Changes

- 8d09f12: Forward pikkuAgent function name to LiteLLM as request metadata for per-agent usage breakdown.

  Adds an optional `agentId` field to `AIAgentRunnerParams`. The wiring layer (`runAIAgent`, `streamAIAgent`, and the resume path) sets this to the agent's registered function name before invoking the runner. `VercelAIAgentRunner` injects it into `providerOptions` as `metadata.agent_id` so LiteLLM includes it in spend logs, enabling per-agent token and cost breakdowns.

- Updated dependencies [8d09f12]
  - @pikku/core@0.12.23

## 0.12.0

## 0.12.3

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- Updated dependencies [f85c234]
- Updated dependencies [88d3100]
  - @pikku/core@0.12.14

## 0.12.2

### Patch Changes

- 387b2ee: Add tool error handling, set needsApproval flag on approval tools, and propagate stream errors instead of silently swallowing them
- 7d369f3: Fix agent sub-agent tool execution failures: use UUID for sub-agent thread IDs (was exceeding varchar(36) DB column), and synthesize error results for failed tool calls in non-streaming run() to prevent "Tool result is missing" cascading errors.
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.1

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

### New Features

- Initial release of `@pikku/ai-vercel`
- `VercelAIAgentRunner` implementing `AIAgentRunnerService`
- Multi-provider support (OpenAI, Anthropic, Ollama, etc.) via `provider/model` format
- Streaming and non-streaming agent execution
- Structured output with schema validation
