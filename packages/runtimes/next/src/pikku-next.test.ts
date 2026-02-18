import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PikkuNextJS } from './pikku-next.js'

describe('PikkuNextJS singleton initialization', () => {
  test('propagates singleton init errors instead of hanging', async () => {
    const app = new PikkuNextJS(
      async () => ({}),
      async () => {
        throw new Error('init failed')
      }
    )

    await assert.rejects(() => (app as any).getSingletonServices(), {
      message: 'init failed',
    })
  })

  test('shares in-flight singleton initialization promise', async () => {
    let callCount = 0
    const singletonServices = { logger: {} } as any
    const app = new PikkuNextJS(
      async () => ({}),
      async () => {
        callCount += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return singletonServices
      }
    )

    const [a, b] = await Promise.all([
      (app as any).getSingletonServices(),
      (app as any).getSingletonServices(),
    ])

    assert.equal(callCount, 1)
    assert.equal(a, singletonServices)
    assert.equal(b, singletonServices)
  })
})
