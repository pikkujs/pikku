import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import Fastify from 'fastify'
import { setSingletonServices } from '@pikku/core'
import { resetPikkuState } from '@pikku/core/internal'
import type { Logger } from '@pikku/core/services'

import pikkuFastifyPlugin from './index.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

const buildApp = async (maxBodySize?: number) => {
  const app = Fastify({})
  await app.register(pikkuFastifyPlugin, {
    pikku: { logger: noopLogger, ...(maxBodySize ? { maxBodySize } : {}) },
  })
  await app.ready()
  return app
}

describe('pikkuFastifyPlugin body size limit', () => {
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

  test('rejects a body over the configured maxBodySize with a 413', async () => {
    const app = await buildApp(128)
    const response = await app.inject({
      method: 'POST',
      url: '/anything',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(4096) }),
    })
    assert.equal(response.statusCode, 413)
    await app.close()
  })

  test('accepts a body under the configured maxBodySize', async () => {
    const app = await buildApp(4096)
    const response = await app.inject({
      method: 'POST',
      url: '/anything',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ ok: true }),
    })
    assert.notEqual(
      response.statusCode,
      413,
      'a body within the limit must not be rejected as too large'
    )
    await app.close()
  })
})
