import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '@pikku/core'

import { InMemorySchedulerService } from './in-memory-scheduler-service.js'

beforeEach(() => {
  resetPikkuState()
})

describe('InMemorySchedulerService scheduleRPC', () => {
  test('throws when setPikkuFunctionRunner has not been called', async () => {
    const scheduler = new InMemorySchedulerService({
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    } as any)
    await assert.rejects(() => scheduler.scheduleRPC(0, 'testRpc', {}), {
      message:
        'InMemorySchedulerService requires setPikkuFunctionRunner() before scheduling RPCs',
    })
  })

  test('uses empty wire context and does not create wire services', async () => {
    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    }
    const scheduler = new InMemorySchedulerService(logger as any)
    const session = { userId: 'user-1' }

    let invokeCalls = 0
    let capturedSession: any

    try {
      pikkuState(null, 'rpc', 'meta').testRpc = 'rpc_testRpc'
      scheduler.setPikkuFunctionRunner(
        async (_wireType, _wireId, _funcName, input) => {
          invokeCalls += 1
          capturedSession = await input.sessionService?.get?.()
        }
      )
      await scheduler.scheduleRPC(0, 'testRpc', { ok: true }, session as any)
      await new Promise((resolve) => setTimeout(resolve, 10))
    } finally {
      await scheduler.close()
    }

    assert.equal(invokeCalls, 1)
    assert.equal(capturedSession, session)
  })
})
