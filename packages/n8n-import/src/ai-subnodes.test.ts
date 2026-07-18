import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseN8n } from './parse-n8n.js'
import { findAgentSubNode, walkAiChain } from './ai-subnodes.js'

// chainRetrievalQa --ai_retriever--> retriever --ai_vectorStore--> store --ai_embedding--> embeddings
const retrievalChainWorkflow = {
  name: 'Retrieval Chain',
  nodes: [
    {
      id: 'c',
      name: 'QA Chain',
      type: '@n8n/n8n-nodes-langchain.chainRetrievalQa',
      parameters: {},
    },
    {
      id: 'r',
      name: 'Retriever',
      type: '@n8n/n8n-nodes-langchain.retrieverVectorStore',
      parameters: {},
    },
    {
      id: 'v',
      name: 'Pinecone Store',
      type: '@n8n/n8n-nodes-langchain.vectorStorePinecone',
      parameters: {},
    },
    {
      id: 'e',
      name: 'Embeddings',
      type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
      parameters: {},
    },
    {
      id: 'm',
      name: 'Groq Model',
      type: '@n8n/n8n-nodes-langchain.lmChatGroq',
      parameters: {},
    },
  ],
  connections: {
    Retriever: {
      ai_retriever: [[{ node: 'QA Chain', type: 'ai_retriever', index: 0 }]],
    },
    'Pinecone Store': {
      ai_vectorStore: [
        [{ node: 'Retriever', type: 'ai_vectorStore', index: 0 }],
      ],
    },
    Embeddings: {
      ai_embedding: [
        [{ node: 'Pinecone Store', type: 'ai_embedding', index: 0 }],
      ],
    },
    'Groq Model': {
      ai_languageModel: [
        [{ node: 'QA Chain', type: 'ai_languageModel', index: 0 }],
      ],
    },
  },
}

test('walkAiChain follows a multi-hop ai_* path to the terminal sub-node', () => {
  const parsed = parseN8n(retrievalChainWorkflow)
  const store = walkAiChain(parsed, 'QA Chain', [
    'ai_retriever',
    'ai_vectorStore',
  ])
  assert.equal(store?.name, 'Pinecone Store')
  assert.equal(store?.typeShort, 'vectorStorePinecone')
})

test('walkAiChain reaches the embeddings node across three hops', () => {
  const parsed = parseN8n(retrievalChainWorkflow)
  const emb = walkAiChain(parsed, 'QA Chain', [
    'ai_retriever',
    'ai_vectorStore',
    'ai_embedding',
  ])
  assert.equal(emb?.name, 'Embeddings')
})

test('walkAiChain returns undefined when a hop is missing', () => {
  const parsed = parseN8n(retrievalChainWorkflow)
  assert.equal(walkAiChain(parsed, 'QA Chain', ['ai_memory']), undefined)
  assert.equal(
    walkAiChain(parsed, 'QA Chain', ['ai_retriever', 'ai_memory']),
    undefined
  )
})

test('walkAiChain with a single hop matches findAgentSubNode', () => {
  const parsed = parseN8n(retrievalChainWorkflow)
  const viaWalk = walkAiChain(parsed, 'QA Chain', ['ai_retriever'])
  const viaFind = findAgentSubNode(parsed, 'QA Chain', 'ai_retriever')
  assert.equal(viaWalk?.name, viaFind?.name)
  assert.equal(viaWalk?.name, 'Retriever')
})
