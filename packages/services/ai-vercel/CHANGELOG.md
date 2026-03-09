## 0.12.0

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
