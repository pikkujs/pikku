/**
 * n8n LangChain RAG sub-node types → Pikku addon rpcs. Modeled on `model-map.ts`:
 * a Record lookup with graceful `undefined` for unmapped types. Vector-store and
 * embedding providers that have no addon yet still get a namespace/rpc here — the
 * emitted `wireAddon` is runnable once that addon is built (demand-driven).
 */

/** n8n vector-store node type (short) → `@pikku/addon-<namespace>`. */
const VECTOR_STORE_BY_TYPE: Record<string, string> = {
  vectorStoreQdrant: 'qdrant',
  vectorStorePinecone: 'pinecone',
  vectorStoreSupabase: 'supabase',
  vectorStorePGVector: 'pgvector',
  vectorStoreInMemory: 'in-memory',
  vectorStoreMilvus: 'milvus',
}

/** n8n embeddings node type (short) → the Pikku addon rpc that embeds text. */
const EMBEDDINGS_BY_TYPE: Record<string, string> = {
  embeddingsOpenAi: 'openai:textEmbedding',
  embeddingsGoogleGemini: 'gemini:embed',
  embeddingsMistralCloud: 'mistral:embed',
  embeddingsOllama: 'ollama:ollamaEmbed',
}

/** n8n text-splitter node type (short) → the `graph:splitText` strategy. */
const SPLITTER_STRATEGY_BY_TYPE: Record<string, string> = {
  textSplitterRecursiveCharacterTextSplitter: 'recursive',
  textSplitterTokenSplitter: 'token',
  textSplitterCharacterTextSplitter: 'character',
}

export function vectorStoreNamespace(typeShort: string): string | undefined {
  return VECTOR_STORE_BY_TYPE[typeShort]
}

export function embeddingsRpc(typeShort: string): string | undefined {
  return EMBEDDINGS_BY_TYPE[typeShort]
}

export function splitterStrategy(typeShort: string): string | undefined {
  return SPLITTER_STRATEGY_BY_TYPE[typeShort]
}

/**
 * The collection/index name a vector-store node targets. Reads n8n's various
 * per-provider param names (Qdrant `indexName`, Pinecone `pineconeIndex`,
 * Supabase `tableName`), unwrapping a resource-locator, with a stable fallback.
 */
export function collectionName(parameters: Record<string, unknown>): string {
  for (const key of [
    'indexName',
    'pineconeIndex',
    'tableName',
    'qdrantCollection',
    'mongoCollection',
    'milvusCollection',
    'vectorIndexName',
  ] as const) {
    const value = parameters[key]
    if (value && typeof value === 'object' && 'value' in value) {
      const v = (value as { value?: unknown }).value
      if (typeof v === 'string' && v) return v
    }
    if (typeof value === 'string' && value) return value
  }
  return 'my-collection'
}
