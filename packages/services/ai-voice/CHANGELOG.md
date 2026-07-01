# @pikku/ai-voice

## 0.12.3

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.2

### Patch Changes

- 6bca38f: Extend `aiAgentRunner` with AI SDK-style media methods for transcription, speech, image generation, embeddings, and reranking.

  Move `voiceInput` and `voiceOutput` into `@pikku/core/ai-agent`, backed by the injected `aiAgentRunner`.

  Deprecate `@pikku/ai-voice` and strip its exports.

- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.1

### Patch Changes

- a2ee6d0: Restrict audio URL fetching to HTTP(S) only and enforce a 50MB size limit to prevent SSRF and memory exhaustion.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9
