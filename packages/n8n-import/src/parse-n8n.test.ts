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
