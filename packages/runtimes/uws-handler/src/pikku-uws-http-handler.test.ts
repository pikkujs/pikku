import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { setSingletonServices } from '@pikku/core/state'
import { resetPikkuState } from '@pikku/core/state'
import type { Logger } from '@pikku/core/services'

import { pikkuHTTPHandler } from './pikku-uws-http-handler.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

type FakeResponse = {
  status: string | undefined
  body: string | undefined
  ended: boolean
  onData: ((chunk: ArrayBuffer, isLast: boolean) => void) | undefined
}

const fakeRequest = (headers: Record<string, string>) =>
  ({
    getMethod: () => 'post',
    getUrl: () => '/anything',
    getQuery: () => '',
    forEach: (cb: (key: string, value: string) => void) => {
      for (const [key, value] of Object.entries(headers)) {
        cb(key, value)
      }
    },
  }) as any

const fakeResponse = () => {
  const state: FakeResponse = {
    status: undefined,
    body: undefined,
    ended: false,
    onData: undefined,
  }
  const res = {
    onAborted: () => {},
    onData: (cb: (chunk: ArrayBuffer, isLast: boolean) => void) => {
      state.onData = cb
    },
    cork: (cb: () => void) => cb(),
    writeStatus: (status: string) => {
      state.status = status
      return res
    },
    writeHeader: () => res,
    write: () => true,
    end: (body?: string) => {
      state.body = body
      state.ended = true
      return res
    },
    endWithoutBody: () => {
      state.ended = true
      return res
    },
  }
  return { res: res as any, state }
}

const settle = async (state: FakeResponse) => {
  for (let i = 0; i < 50 && !state.ended; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('pikkuHTTPHandler body size limit', () => {
  before(() => {
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
  })

  after(() => {
    resetPikkuState()
  })

  test('rejects a streamed body over the limit with a 413', async () => {
    const handler = pikkuHTTPHandler({ logger: noopLogger, maxBodySize: 32 })
    const { res, state } = fakeResponse()
    handler(res, fakeRequest({ 'content-type': 'application/json' }))

    assert.ok(state.onData, 'handler must subscribe to body chunks')
    const chunk = new TextEncoder().encode('x'.repeat(64))
    state.onData!(chunk.buffer as ArrayBuffer, true)
    await settle(state)

    assert.equal(state.status, '413')
    assert.match(state.body ?? '', /PayloadTooLargeError/)
  })

  test('rejects a body whose content-length exceeds the limit with a 413', async () => {
    const handler = pikkuHTTPHandler({ logger: noopLogger, maxBodySize: 32 })
    const { res, state } = fakeResponse()
    handler(
      res,
      fakeRequest({
        'content-type': 'application/json',
        'content-length': '4096',
      })
    )

    const chunk = new TextEncoder().encode('x')
    state.onData!(chunk.buffer as ArrayBuffer, true)
    await settle(state)

    assert.equal(state.status, '413')
  })

  test('lets a body under the limit through to routing', async () => {
    const handler = pikkuHTTPHandler({ logger: noopLogger, maxBodySize: 4096 })
    const { res, state } = fakeResponse()
    handler(res, fakeRequest({ 'content-type': 'application/json' }))

    const chunk = new TextEncoder().encode(JSON.stringify({ ok: true }))
    state.onData!(chunk.buffer as ArrayBuffer, true)
    await settle(state)

    assert.equal(
      state.status,
      '404',
      'an in-limit body reaches routing and 404s on the unregistered route'
    )
  })
})
