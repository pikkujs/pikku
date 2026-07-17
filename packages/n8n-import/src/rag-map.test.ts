import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  vectorStoreNamespace,
  embeddingsRpc,
  collectionName,
  splitterStrategy,
} from './rag-map.js'

test('vectorStoreNamespace maps known stores and returns undefined otherwise', () => {
  assert.equal(vectorStoreNamespace('vectorStoreQdrant'), 'qdrant')
  assert.equal(vectorStoreNamespace('vectorStorePinecone'), 'pinecone')
  assert.equal(vectorStoreNamespace('vectorStoreSupabase'), 'supabase')
  assert.equal(vectorStoreNamespace('vectorStorePGVector'), 'pgvector')
  assert.equal(vectorStoreNamespace('vectorStoreInMemory'), 'in-memory')
  assert.equal(vectorStoreNamespace('vectorStoreMilvus'), 'milvus')
  // the langchain tool wrapper resolves to the same store namespace
  assert.equal(vectorStoreNamespace('toolVectorStore'), undefined)
  assert.equal(vectorStoreNamespace('somethingElse'), undefined)
})

test('embeddingsRpc maps known providers and returns undefined otherwise', () => {
  assert.equal(embeddingsRpc('embeddingsOpenAi'), 'openai:textEmbedding')
  assert.equal(embeddingsRpc('embeddingsGoogleGemini'), 'gemini:embed')
  assert.equal(embeddingsRpc('embeddingsMistralCloud'), 'mistral:embed')
  assert.equal(embeddingsRpc('embeddingsOllama'), 'ollama:ollamaEmbed')
  assert.equal(embeddingsRpc('lmChatOpenAi'), undefined)
})

test('collectionName reads the index/table param with a fallback', () => {
  assert.equal(collectionName({ indexName: 'docs' }), 'docs')
  assert.equal(collectionName({ pineconeIndex: 'kb' }), 'kb')
  assert.equal(collectionName({ tableName: 'embeddings' }), 'embeddings')
  // resource-locator form
  assert.equal(
    collectionName({ indexName: { __rl: true, value: 'rl-docs' } }),
    'rl-docs'
  )
  assert.equal(collectionName({}), 'my-collection')
})

test('collectionName covers the per-store key names', () => {
  assert.equal(
    collectionName({ qdrantCollection: { __rl: true, value: 'q' } }),
    'q'
  )
  assert.equal(
    collectionName({ pineconeIndex: { __rl: true, value: 'p' } }),
    'p'
  )
  assert.equal(collectionName({ mongoCollection: 'm' }), 'm')
  assert.equal(collectionName({ milvusCollection: 'mv' }), 'mv')
  assert.equal(collectionName({ vectorIndexName: 'vi' }), 'vi')
})

test('splitterStrategy maps splitter types', () => {
  assert.equal(
    splitterStrategy('textSplitterRecursiveCharacterTextSplitter'),
    'recursive'
  )
  assert.equal(splitterStrategy('textSplitterTokenSplitter'), 'token')
  assert.equal(
    splitterStrategy('textSplitterCharacterTextSplitter'),
    'character'
  )
  assert.equal(splitterStrategy('notASplitter'), undefined)
})
