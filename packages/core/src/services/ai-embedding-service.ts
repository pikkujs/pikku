/**
 * A narrow, dedicated embedding service.
 *
 * Vector stores (Qdrant, Pinecone, Supabase/pgvector, …) depend on this to turn
 * text into vectors, at BOTH index time (ingest) and query time (search). The
 * embedding model is fixed at construction so those two moments cannot drift
 * into different vector spaces — a mismatch would silently break similarity
 * search. Provider addons (e.g. `@pikku/addon-openai`) implement it; the app
 * wires a single instance into `singletonServices.aiEmbedding`.
 *
 * This is deliberately smaller than {@link AIAgentRunnerService} (whose optional
 * `embed`/`embedMany` take a per-call model): a vector store should not have to
 * pull in the whole agent-runner tool loop just to embed, and pinning the model
 * to the service is what guarantees index/query consistency.
 *
 * Documents (ingested corpus) and queries (search text) are embedded through
 * separate methods because some models are asymmetric — Cohere's `input_type`,
 * E5's `query:`/`passage:` prefixes, BGE's query instruction — and must know
 * which side they are embedding to produce comparable vectors. Symmetric
 * providers (e.g. OpenAI) point both methods at the same call.
 */
export interface AIEmbeddingService {
  /** The embedding model backing this service. Index and query share it. */
  readonly model: string
  /** The vector dimensionality this model produces, when known. */
  readonly dimensions?: number
  /** Embed corpus documents (index time), preserving input order. */
  embedDocuments(values: string[]): Promise<number[][]>
  /** Embed a search query (query time) into a vector. */
  embedQuery(value: string): Promise<number[]>
}
