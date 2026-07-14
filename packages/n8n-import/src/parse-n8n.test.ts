import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseN8n } from './parse-n8n.js'

const minimal = { nodes: [], connections: {} }

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
