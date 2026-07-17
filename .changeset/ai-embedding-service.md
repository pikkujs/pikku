---
'@pikku/core': patch
---

Add a narrow, model-baked `AIEmbeddingService` interface and an optional
`aiEmbedding` slot on `CoreSingletonServices`. Vector-store addons depend on it
to embed text at both index and query time; pinning the model to the service
keeps the two on the same vector space. Documents and queries embed through
separate `embedDocuments`/`embedQuery` methods so asymmetric providers (Cohere
`input_type`, E5 prefixes, BGE query instruction) can produce comparable
vectors. Provider addons (e.g. `@pikku/addon-openai`) implement it and the app
wires a single instance.
