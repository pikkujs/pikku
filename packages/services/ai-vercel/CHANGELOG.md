## 0.12.0

## 0.12.2

### Patch Changes

- 387b2ee: Add tool error handling, set needsApproval flag on approval tools, and propagate stream errors instead of silently swallowing them
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
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
