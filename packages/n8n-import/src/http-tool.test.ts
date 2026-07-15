import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpToolSpec, isHttpRequestTool } from './http-tool.js'
import type { N8nCredentialRef } from './types.js'

const toolNode = (
  parameters: Record<string, unknown>,
  credentials?: Record<string, N8nCredentialRef>
) => ({
  name: 'Fetch Tokens',
  typeShort: 'toolHttpRequest',
  parameters,
  credentials,
})

test('isHttpRequestTool matches both tool variants', () => {
  assert.equal(isHttpRequestTool('toolHttpRequest'), true)
  assert.equal(isHttpRequestTool('httpRequestTool'), true)
  assert.equal(isHttpRequestTool('httpRequest'), false)
})

test('a static no-auth GET tool → spec with url/method/description', () => {
  const spec = httpToolSpec(
    toolNode({
      url: 'https://api.dexscreener.com/token-profiles/latest/v1',
      toolDescription: 'Fetch the latest token profiles.',
      sendHeaders: true,
      parametersHeaders: { values: [{ name: 'Accept', value: '*/*' }] },
    })
  )
  assert.ok(spec)
  assert.equal(spec.url, 'https://api.dexscreener.com/token-profiles/latest/v1')
  assert.equal(spec.method, 'GET')
  assert.equal(spec.description, 'Fetch the latest token profiles.')
  assert.deepEqual(spec.headers, { Accept: '*/*' })
  assert.equal(spec.auth, undefined)
})

test('method is uppercased; falls back to the node name for the description', () => {
  const spec = httpToolSpec(toolNode({ url: 'https://x.test', method: 'post' }))
  assert.equal(spec?.method, 'POST')
  assert.equal(spec?.description, 'Fetch Tokens')
})

test('a static-key authed tool → spec.auth from the shared recipe table', () => {
  const spec = httpToolSpec(
    toolNode(
      {
        url: 'https://api.openai.com/v1/models',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'openAiApi',
      },
      { openAiApi: { name: 'My OpenAI' } }
    )
  )
  assert.equal(spec?.auth?.mode, 'bearer')
  assert.equal(spec?.auth?.credential, 'my-open-ai')
})

test('a dynamic URL ($fromAI / {{ }} / {placeholder}) → undefined (stays a stub)', () => {
  assert.equal(
    httpToolSpec(toolNode({ url: "={{ $fromAI('url') }}" })),
    undefined
  )
  assert.equal(
    httpToolSpec(toolNode({ url: 'https://x.test/{symbol}' })),
    undefined
  )
  assert.equal(httpToolSpec(toolNode({ url: '={{ $json.url }}' })), undefined)
})

test('OAuth2 auth → undefined (no static recipe, stays a stub)', () => {
  assert.equal(
    httpToolSpec(
      toolNode({
        url: 'https://x.test',
        authentication: 'genericCredentialType',
        genericAuthType: 'oAuth2Api',
      })
    ),
    undefined
  )
})

test('dynamic-valued headers are dropped, static ones kept', () => {
  const spec = httpToolSpec(
    toolNode({
      url: 'https://x.test',
      parametersHeaders: {
        values: [
          { name: 'Accept', value: 'application/json' },
          { name: 'X-Dyn', value: "={{ $fromAI('x') }}" },
        ],
      },
    })
  )
  assert.deepEqual(spec?.headers, { Accept: 'application/json' })
})
