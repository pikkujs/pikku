---
'@pikku/core': patch
---

Add a narrow, model-baked `AIEmbeddingService` interface and an optional
`aiEmbedding` slot on `CoreSingletonServices`. Vector-store addons depend on it
to embed text at both index and query time; pinning the model to the service
guarantees the two share the same vector space. Provider addons (e.g.
`@pikku/addon-openai`) implement it and the app wires a single instance.
