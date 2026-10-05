import assert from 'node:assert/strict'
import { test } from 'node:test'
import register from './navigate-extension.mjs'

function load(screens) {
  if (screens === undefined) delete process.env.PIKKU_STUDIO_SCREENS
  else process.env.PIKKU_STUDIO_SCREENS = screens
  let tool
  register({ registerTool: (t) => (tool = t), on: () => {} })
  return tool
}

test('returns the navigation intent as details', async () => {
  const result = await load('workflows,pages').execute('id', { screen: 'workflows', id: ' sendInvoice ', title: 'Open the invoice workflow' })
  assert.deepEqual(result.details, { navigate: { screen: 'workflows', id: 'sendInvoice', title: 'Open the invoice workflow' } })
  assert.equal(result.isError, undefined)
})

test('lists the screens Studio passes and refuses others', async () => {
  const tool = load('workflows,pages')
  assert.deepEqual(tool.parameters.properties.screen.enum, ['workflows', 'pages'])
  const result = await tool.execute('id', { screen: 'billing' })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /Use one of: workflows, pages/)
})

test('any screen when Studio passes none', async () => {
  const result = await load(undefined).execute('id', { screen: 'design' })
  assert.deepEqual(result.details, { navigate: { screen: 'design' } })
})
