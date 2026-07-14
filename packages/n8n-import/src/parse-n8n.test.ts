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
