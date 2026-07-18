---
'@pikku/n8n-import': patch
'@pikku/addon-graph': patch
---

Import n8n RAG flows (v1) — retrieval **and** ingestion. Vector-store nodes now
emit runnable addon calls instead of throwing `#902` stubs, driven by a new
`rag-map` (store type → addon namespace, embedding provider, collection name):

- **Retrieval-as-tool** — a vector-store node in `retrieve-as-tool` mode becomes
  an addon-backed agent tool refing the store's `query` rpc directly (e.g.
  `ref("qdrant:query")`); its `ai_embedding` sub-node is absorbed.
- **chainRetrievalQa** — modelled as a deterministic retrieve-then-answer
  pipeline: the vector store is spliced onto the main flow as a `<ns>:query`
  step (`{ collection, query, topK }`, question lowered from the chain's prompt)
  feeding a tools-less agent with a retrieval-QA goal, so the search always runs
  before the LLM. The retriever wrapper is absorbed.
- **Ingestion (`mode: insert`)** — expanded into an explicit
  `mainPred → graph:splitText → <ns>:ingest` pipeline: the loader/splitter/
  embedding spokes are absorbed, a new `graph:splitText` builtin (added to
  `@pikku/addon-graph`) chunks the source text, and its `{ chunks }` output is
  fed into the store's `ingest` rpc via a field-path `ref`. An unmapped store
  keeps its stub.
