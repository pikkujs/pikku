// knowledge: decisions/design/the-embedding-model-is-pinned-per-service-and-doc-query-embedding-is-split.md
export interface AIEmbeddingService {
  readonly model: string
  readonly dimensions?: number
  /** Index time. Preserves input order. */
  embedDocuments(values: string[]): Promise<number[][]>
  /** Query time. */
  embedQuery(value: string): Promise<number[]>
}
