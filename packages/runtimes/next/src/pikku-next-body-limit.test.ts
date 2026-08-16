import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { setSingletonServices } from '@pikku/core/state'
import { wireHTTP } from '@pikku/core/http'
import { httpRouter } from '@pikku/core/http'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import type { Logger } from '@pikku/core/services'

import { PikkuNextJS } from './pikku-next.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

const registerEchoRoute = () => {
  setSingletonServices({
    logger: noopLogger,
    schema: {
      compileSchema: () => {},
      getSchemaNames: () => new Set<string>(),
    },
  } as any)
  pikkuState(null, 'function', 'meta', {
    echo: {
      pikkuFuncId: 'echo',
      services: [],
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    },
  } as any)
  pikkuState(null, 'http', 'meta', {
    get: {},
    post: { echo: { pikkuFuncId: 'echo', route: 'echo', method: 'post' } },
    put: {},
    patch: {},
    delete: {},
    head: {},
    options: {},
  } as any)
  wireHTTP({
    route: 'echo',
    method: 'post',
    auth: false,
    func: { func: async () => ({ ok: true }) } as any,
  })
  httpRouter.initialize()
}

const nextApp = () =>
  new PikkuNextJS(
    async () => ({}) as any,
    async () => ({ logger: noopLogger }) as any
  )

const oversizedRequest = () =>
  new Request('http://localhost/echo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(4096) }),
  })

describe('PikkuNextJS.apiRequest body size limit', () => {
  afterEach(() => {
    resetPikkuState()
  })

  test('rejects a body over the configured maxBodySize with a 413', async () => {
    registerEchoRoute()
    const response = await nextApp().apiRequest(oversizedRequest(), {
      maxBodySize: 128,
    })
    assert.equal(response.status, 413)
  })

  test('accepts a body under the configured maxBodySize', async () => {
    registerEchoRoute()
    const response = await nextApp().apiRequest(
      new Request('http://localhost/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }),
      { maxBodySize: 4096 }
    )
    assert.equal(response.status, 200)
  })
})
