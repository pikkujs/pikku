---
type: decision
title: The embedding model is pinned per service and doc/query embedding is split
description: AIEmbeddingService fixes its model at construction so index and query share a vector space, and separates embedDocuments from embedQuery for asymmetric models
tags: services
---

# The embedding model is pinned per service and doc/query embedding is split

`AIEmbeddingService` (`packages/core/src/services/ai-embedding-service.ts`) is a
deliberately narrow interface with two properties that look like restrictions.
The model is `readonly` and fixed at construction rather than passed per call,
and documents and queries go through separate methods.

Both are about comparability. Vector stores (Qdrant, Pinecone, pgvector) embed at
index time and again at query time; if those two moments can name different
models they end up in different vector spaces, and similarity search does not
error — it silently returns nonsense. Pinning the model to the service makes the
drift unrepresentable. The split methods exist because several embedding models
are asymmetric and must know which side they are embedding to produce comparable
vectors: Cohere's `input_type`, E5's `query:` / `passage:` prefixes, BGE's query
instruction. Symmetric providers such as OpenAI simply point both methods at the
same call.

**What this rules out:** adding a per-call `model` parameter, collapsing
`embedDocuments` and `embedQuery` into one `embed`, and pointing a vector store
at `AgentRunnerService.embed` / `embedMany` instead — those take a per-call
model on purpose and drag in the whole agent-runner tool loop, and they give back
neither guarantee.
