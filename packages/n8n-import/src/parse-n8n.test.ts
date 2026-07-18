import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseN8n, UnsupportedTopologyError } from './parse-n8n.js'

const minimal = { nodes: [], connections: {} }

const respondWorkflow = (withSuccessor: boolean) => ({
  name: 'Respond Flow',
  nodes: [
    {
      id: 'w',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      parameters: {},
    },
    {
      id: 'r',
      name: 'Respond',
      type: 'n8n-nodes-base.respondToWebhook',
      parameters: {},
    },
    { id: 's', name: 'After', type: 'n8n-nodes-base.set', parameters: {} },
  ],
  connections: {
    Webhook: { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
    ...(withSuccessor
      ? { Respond: { main: [[{ node: 'After', type: 'main', index: 0 }]] } }
      : {}),
  },
})

test('parseN8n uses the workflow name when present, ignoring the hint', () => {
  const parsed = parseN8n({ ...minimal, name: 'My Cool Flow' }, 'some-file')
  assert.equal(parsed.name, 'My Cool Flow')
  assert.equal(parsed.slug, 'myCoolFlow')
})

test('parseN8n falls back to the name hint when the workflow is nameless', () => {
  const parsed = parseN8n(
    { ...minimal },
    '0363_HTTP_Executeworkflow_Automate_Webhook'
  )
  assert.equal(parsed.slug, 'n0363HttpExecuteworkflowAutomateWebhook')
  assert.notEqual(parsed.slug, 'importedWorkflow')
})

test('parseN8n falls back to imported-workflow with no name and no hint', () => {
  const parsed = parseN8n({ ...minimal })
  assert.equal(parsed.slug, 'importedWorkflow')
})

test('parseN8n prefers a blank name over an empty-string hint', () => {
  const parsed = parseN8n({ ...minimal, name: '   ' }, '')
  assert.equal(parsed.slug, 'importedWorkflow')
})

test('a mid-flow respondToWebhook throws a typed UnsupportedTopologyError', () => {
  try {
    parseN8n(respondWorkflow(true))
    assert.fail('expected parseN8n to throw')
  } catch (err) {
    assert.ok(
      err instanceof UnsupportedTopologyError,
      'is an UnsupportedTopologyError'
    )
    assert.equal((err as UnsupportedTopologyError).reason, 'midflow-response')
  }
})

test('a terminal respondToWebhook is a transparent drop (no throw)', () => {
  const parsed = parseN8n(respondWorkflow(false))
  // the respond node is dropped to a noop; parsing succeeds
  assert.ok(parsed.nodes.some((n) => n.name === 'Webhook'))
})

const httpWorkflow = (
  httpParams: Record<string, unknown>,
  credentials?: Record<string, { id?: string; name?: string }>
) => ({
  name: 'HTTP Flow',
  nodes: [
    {
      id: 't',
      name: 'Manual',
      type: 'n8n-nodes-base.manualTrigger',
      parameters: {},
    },
    {
      id: 'h',
      name: 'Call API',
      type: 'n8n-nodes-base.httpRequest',
      parameters: httpParams,
      credentials,
    },
  ],
  connections: {
    Manual: { main: [[{ node: 'Call API', type: 'main', index: 0 }]] },
  },
})

test('a no-auth httpRequest maps to graph:httpRequest with no auth descriptor', () => {
  const parsed = parseN8n(
    httpWorkflow({ url: 'https://x.test', authentication: 'none' })
  )
  const node = parsed.nodes.find((n) => n.name === 'Call API')!
  assert.equal(node.role, 'http')
  assert.equal(node.rpcName, 'graph:httpRequest')
  assert.equal(node.httpAuth, undefined)
})

test('an authenticated httpRequest with a recipe maps to http + sets httpAuth', () => {
  const parsed = parseN8n(
    httpWorkflow(
      {
        url: 'https://x.test',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'openAiApi',
      },
      { openAiApi: { name: 'My OpenAI' } }
    )
  )
  const node = parsed.nodes.find((n) => n.name === 'Call API')!
  assert.equal(node.role, 'http')
  assert.equal(node.rpcName, 'graph:httpRequest')
  assert.equal(node.httpAuth?.mode, 'bearer')
  assert.equal(node.httpAuth?.credential, 'my-open-ai')
})

test('an OAuth2 httpRequest has no recipe and stays an integration stub', () => {
  const parsed = parseN8n(
    httpWorkflow({
      url: 'https://x.test',
      authentication: 'genericCredentialType',
      genericAuthType: 'oAuth2Api',
    })
  )
  const node = parsed.nodes.find((n) => n.name === 'Call API')!
  assert.equal(node.role, 'integration')
  assert.equal(node.httpAuth, undefined)
})

const openAiWorkflow = (parameters: Record<string, unknown>) => ({
  name: 'OpenAI Flow',
  nodes: [
    {
      id: 't',
      name: 'Manual',
      type: 'n8n-nodes-base.manualTrigger',
      parameters: {},
    },
    { id: 'o', name: 'OpenAI', type: 'n8n-nodes-base.openAi', parameters },
  ],
  connections: {
    Manual: { main: [[{ node: 'OpenAI', type: 'main', index: 0 }]] },
  },
})

test('an openAi text-completion node is promoted to an agent', () => {
  const parsed = parseN8n(
    openAiWorkflow({ prompt: '={{ $json.text }}\n\nTl;dr:', model: 'gpt-4o' })
  )
  const node = parsed.nodes.find((n) => n.name === 'OpenAI')!
  assert.equal(node.role, 'agent')
  assert.equal(parsed.shape, 'agent-only')
})

test('an openAi chat node (messages) is promoted to an agent', () => {
  const parsed = parseN8n(
    openAiWorkflow({
      resource: 'chat',
      prompt: { messages: [{ content: '=Summarize {{ $json.text }}' }] },
    })
  )
  assert.equal(parsed.nodes.find((n) => n.name === 'OpenAI')!.role, 'agent')
})

test('an openAi image node is NOT an agent (deferred, stays a native/stub node)', () => {
  const parsed = parseN8n(
    openAiWorkflow({
      resource: 'image',
      operation: 'generate',
      prompt: 'a cat',
    })
  )
  assert.notEqual(parsed.nodes.find((n) => n.name === 'OpenAI')!.role, 'agent')
})

test('an openAi assistant node is NOT an agent in v1 (deferred)', () => {
  const parsed = parseN8n(
    openAiWorkflow({ resource: 'assistant', operation: 'message' })
  )
  assert.notEqual(parsed.nodes.find((n) => n.name === 'OpenAI')!.role, 'agent')
})

const vectorStoreToolWorkflow = (storeType: string, mode: string) => ({
  name: 'RAG Tool Flow',
  nodes: [
    {
      id: 'a',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      parameters: {},
    },
    {
      id: 'v',
      name: 'Qdrant Vector Store',
      type: `@n8n/n8n-nodes-langchain.${storeType}`,
      parameters: { mode, qdrantCollection: { __rl: true, value: 'docs' } },
    },
    {
      id: 'e',
      name: 'Embeddings OpenAI',
      type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
      parameters: {},
    },
  ],
  connections: {
    'Qdrant Vector Store': {
      ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]],
    },
    'Embeddings OpenAI': {
      ai_embedding: [
        [{ node: 'Qdrant Vector Store', type: 'ai_embedding', index: 0 }],
      ],
    },
  },
})

test('a vectorStore in retrieve-as-tool mode becomes an agentTool refing <store>:query', () => {
  const parsed = parseN8n(
    vectorStoreToolWorkflow('vectorStoreQdrant', 'retrieve-as-tool')
  )
  const store = parsed.nodes.find((n) => n.name === 'Qdrant Vector Store')!
  assert.equal(store.role, 'agentTool')
  assert.equal(store.rpcName, 'qdrant:query')
  // its ai_embedding sub-node is absorbed (role model), not a graph stub
  assert.equal(
    parsed.nodes.find((n) => n.name === 'Embeddings OpenAI')!.role,
    'model'
  )
})

test('a vectorStore in insert mode stays a vectorStore node (ingestion, Phase B)', () => {
  const parsed = parseN8n(
    vectorStoreToolWorkflow('vectorStoreQdrant', 'insert')
  )
  assert.equal(
    parsed.nodes.find((n) => n.name === 'Qdrant Vector Store')!.role,
    'vectorStore'
  )
})

const retrievalQaWorkflow = () => ({
  name: 'Retrieval QA',
  nodes: [
    {
      id: 't',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      parameters: {},
    },
    {
      id: 'c',
      name: 'QA Chain',
      type: '@n8n/n8n-nodes-langchain.chainRetrievalQa',
      parameters: { text: '={{ $json.body.question }}' },
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
      parameters: { pineconeIndex: { __rl: true, value: 'kb' } },
    },
    {
      id: 'e',
      name: 'Embeddings',
      type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
      parameters: {},
    },
    {
      id: 'm',
      name: 'Groq',
      type: '@n8n/n8n-nodes-langchain.lmChatGroq',
      parameters: {},
    },
    { id: 'o', name: 'Respond', type: 'n8n-nodes-base.set', parameters: {} },
  ],
  connections: {
    Webhook: { main: [[{ node: 'QA Chain', type: 'main', index: 0 }]] },
    'QA Chain': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
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
    Groq: {
      ai_languageModel: [
        [{ node: 'QA Chain', type: 'ai_languageModel', index: 0 }],
      ],
    },
  },
})

test('chainRetrievalQa becomes a retrieval step feeding a promoted agent', () => {
  const parsed = parseN8n(retrievalQaWorkflow())
  const chain = parsed.nodes.find((n) => n.name === 'QA Chain')!
  const store = parsed.nodes.find((n) => n.name === 'Pinecone Store')!
  const retriever = parsed.nodes.find((n) => n.name === 'Retriever')!

  assert.equal(chain.role, 'agent')
  assert.equal(store.role, 'retrieval')
  assert.equal(store.rpcName, 'pinecone:query')
  // the retriever wrapper is absorbed (no graph stub)
  assert.ok(store.role !== 'vectorStore')
  assert.equal(
    ['model', 'memory', 'outputParser', 'sticky'].includes(retriever.role),
    true
  )

  // the store is spliced onto the main flow: Webhook → store → chain
  const conns = parsed.connections
  assert.equal(conns['Webhook']!.main![0]![0]!.node, 'Pinecone Store')
  assert.equal(conns['Pinecone Store']!.main![0]![0]!.node, 'QA Chain')
})

test('chainRetrievalQa with an unmapped store stays a stub (not promoted)', () => {
  const wf = retrievalQaWorkflow()
  wf.nodes.find((n) => n.name === 'Pinecone Store')!.type =
    '@n8n/n8n-nodes-langchain.vectorStoreCouchbaseSearch'
  const parsed = parseN8n(wf)
  assert.notEqual(
    parsed.nodes.find((n) => n.name === 'QA Chain')!.role,
    'agent'
  )
})

const insertWorkflow = (opts?: { splitter?: boolean; mainPred?: boolean }) => {
  const withSplitter = opts?.splitter ?? true
  const withMainPred = opts?.mainPred ?? true
  const nodes: any[] = [
    {
      id: 'v',
      name: 'Pinecone Store',
      type: '@n8n/n8n-nodes-langchain.vectorStorePinecone',
      parameters: {
        mode: 'insert',
        pineconeIndex: { __rl: true, value: 'docs' },
      },
    },
    {
      id: 'd',
      name: 'Data Loader',
      type: '@n8n/n8n-nodes-langchain.documentDefaultDataLoader',
      parameters: {},
    },
    {
      id: 'e',
      name: 'Embeddings',
      type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
      parameters: {},
    },
  ]
  const connections: any = {
    'Data Loader': {
      ai_document: [
        [{ node: 'Pinecone Store', type: 'ai_document', index: 0 }],
      ],
    },
    Embeddings: {
      ai_embedding: [
        [{ node: 'Pinecone Store', type: 'ai_embedding', index: 0 }],
      ],
    },
  }
  if (withMainPred) {
    nodes.unshift({
      id: 't',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      parameters: {},
    })
    connections['Webhook'] = {
      main: [[{ node: 'Pinecone Store', type: 'main', index: 0 }]],
    }
  }
  if (withSplitter) {
    nodes.push({
      id: 's',
      name: 'Token Splitter',
      type: '@n8n/n8n-nodes-langchain.textSplitterTokenSplitter',
      parameters: { chunkSize: 512 },
    })
    connections['Token Splitter'] = {
      ai_textSplitter: [
        [{ node: 'Data Loader', type: 'ai_textSplitter', index: 0 }],
      ],
    }
  }
  return { name: 'Ingest', nodes, connections }
}

test('vectorStore insert is store-agnostic (pinecone → pinecone:ingest)', () => {
  const parsed = parseN8n(insertWorkflow())
  const store = parsed.nodes.find((n) => n.name === 'Pinecone Store')!
  assert.equal(store.role, 'ingestion')
  assert.equal(store.rpcName, 'pinecone:ingest')
  const split = parsed.nodes.find((n) => n.role === 'splitText')!
  assert.ok(split, 'a graph:splitText node is synthesized')
  assert.equal(split.rpcName, 'graph:splitText')
  // the token splitter drives the strategy
  assert.equal(split.parameters.strategy, 'token')
  assert.equal(split.parameters.chunkSize, 512)
  assert.equal(store.ingestChunksFrom, split.nodeId)
  // loader/splitter/embedding spokes are absorbed
  for (const name of ['Data Loader', 'Token Splitter', 'Embeddings']) {
    assert.equal(parsed.nodes.find((n) => n.name === name)!.role, 'noop')
  }
})

test('vectorStore insert with no splitter defaults to recursive', () => {
  const parsed = parseN8n(insertWorkflow({ splitter: false }))
  const store = parsed.nodes.find((n) => n.name === 'Pinecone Store')!
  assert.equal(store.role, 'ingestion')
  const split = parsed.nodes.find((n) => n.role === 'splitText')!
  assert.ok(split, 'still synthesizes a splitText node')
  assert.equal(split.parameters.strategy, 'recursive')
})

test('vectorStore insert with no main predecessor stays a stub', () => {
  const parsed = parseN8n(insertWorkflow({ mainPred: false }))
  const store = parsed.nodes.find((n) => n.name === 'Pinecone Store')!
  // no docs source to split → do NOT synthesize a split-from-nothing pipeline
  assert.equal(store.role, 'vectorStore')
  assert.ok(!parsed.nodes.some((n) => n.role === 'splitText'))
})
