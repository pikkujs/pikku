import assert from 'node:assert/strict'
import { describe, test, before } from 'node:test'

import '../../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import { createConfig, createSingletonServices } from '../services.js'

const streamFrames = async (route: string): Promise<unknown[]> => {
  const response = await fetch(new Request(`http://localhost${route}`))
  const body = await response.text()
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))
}

before(async () => {
  const config = await createConfig()
  await createSingletonServices(config)
})

describe('sse stream protocol verifier', () => {
  test('a failed stream defaults to the pikku error frames', async () => {
    assert.deepEqual(await streamFrames('/sse-error'), [
      { type: 'error', errorText: 'Internal server error' },
      { type: 'done' },
    ])
  })

  test('a failed agui stream ends with a RUN_ERROR the client can parse', async () => {
    assert.deepEqual(await streamFrames('/sse-agui-error'), [
      { type: 'RUN_ERROR', message: 'Internal server error' },
    ])
  })
})
