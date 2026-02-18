import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemorySchedulerService } from './in-memory-scheduler-service.js'

describe('InMemorySchedulerService scheduleRPC', () => {
  test('throws when setServices has not been called', async () => {
    const scheduler = new InMemorySchedulerService()
    await assert.rejects(() => scheduler.scheduleRPC(0, 'testRpc', {}), {
      message:
        'InMemorySchedulerService requires setServices() before scheduling RPCs',
    })
  })

  test('uses empty wire context and does not create wire services', async () => {
    const scheduler = new InMemorySchedulerService()
    const session = { userId: 'user-1' }

    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    }

    let invokeCalls = 0
    let capturedSession: any

    try {
      scheduler.setServices({
        logger,
        invokeRPC: async (_rpcName: string, _data: any, sessionArg?: any) => {
          invokeCalls += 1
          capturedSession = sessionArg
        },
        runScheduledTask: async () => {},
      } as any)
      await scheduler.scheduleRPC(0, 'testRpc', { ok: true }, session as any)
      await new Promise((resolve) => setTimeout(resolve, 10))
    } finally {
      await scheduler.close()
    }

    assert.equal(invokeCalls, 1)
    assert.equal(capturedSession, session)
  })
})
