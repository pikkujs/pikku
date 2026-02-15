export interface AIVectorService {
  upsert(
    entries: {
      id: string
      vector: number[]
      metadata?: Record<string, unknown>
    }[]
  ): Promise<void>

  search(
    vector: number[],
    options?: {
      topK?: number
      filter?: Record<string, unknown>
    }
  ): Promise<
    { id: string; score: number; metadata?: Record<string, unknown> }[]
  >

  delete(ids: string[]): Promise<void>
}
