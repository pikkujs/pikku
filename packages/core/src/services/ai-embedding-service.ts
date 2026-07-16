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
 */
export interface AIEmbeddingService {
  /** The embedding model backing this service. Index and query share it. */
  readonly model: string
  /** The vector dimensionality this model produces, when known. */
  readonly dimensions?: number
  /** Embed a single value into a vector. */
  embed(value: string): Promise<number[]>
  /** Embed many values into vectors, preserving input order. */
  embedMany(values: string[]): Promise<number[][]>
}
