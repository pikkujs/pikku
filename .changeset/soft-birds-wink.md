---
'@pikku/core': patch
'@pikku/ai-vercel': patch
'@pikku/ai-voice': major
---

Extend `aiAgentRunner` with AI SDK-style media methods for transcription, speech, image generation, embeddings, and reranking.

Move `voiceInput` and `voiceOutput` into `@pikku/core/ai-agent`, backed by the injected `aiAgentRunner`.

Deprecate `@pikku/ai-voice` and strip its exports.
