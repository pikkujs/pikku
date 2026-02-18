import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rpcService } from '@pikku/core/rpc'

import { InMemorySchedulerService } from './in-memory-scheduler-service.js'

describe('InMemorySchedulerService scheduleRPC', () => {
  test('uses empty wire context and does not create wire services', async () => {
    const scheduler = new InMemorySchedulerService()
    const session = { userId: 'user-1' }

    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    }

    let wireServicesFactoryCalls = 0
    let capturedWire: any

    scheduler.setServices(
      {
        logger,
      } as any,
      async () => {
        wireServicesFactoryCalls += 1
        return {}
      }
    )

    const originalGetContextRPCService =
      rpcService.getContextRPCService.bind(rpcService)

    rpcService.getContextRPCService = ((services: any, wire: any) => {
      capturedWire = wire
      return {
        invoke: async () => ({ ok: true }),
      } as any
    }) as any

    try {
      await scheduler.scheduleRPC(0, 'testRpc', { ok: true }, session as any)
      await new Promise((resolve) => setTimeout(resolve, 10))
    } finally {
      rpcService.getContextRPCService = originalGetContextRPCService as any
      await scheduler.close()
    }

    assert.deepEqual(capturedWire, {})
    assert.equal(wireServicesFactoryCalls, 0)
  })
})
