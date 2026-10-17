// knowledge: decisions/internals/the-embedding-model-is-pinned-per-service-and-doc-query-embedding-is-split.md
/**
 * Turns text into vectors for semantic search. One instance is tied to one
 * model, so vectors indexed by it and queries embedded by it stay comparable.
 */
export interface AIEmbeddingService {
  readonly model: string
  readonly dimensions?: number
  /** Index time. Preserves input order. */
  embedDocuments(values: string[]): Promise<number[][]>
  /** Query time. */
  embedQuery(value: string): Promise<number[]>
}
