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
