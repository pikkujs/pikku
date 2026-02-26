import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState } from '@pikku/core/internal'

import { InMemorySchedulerService } from './in-memory-scheduler-service.js'

describe('InMemorySchedulerService scheduleRPC', () => {
  test('schedules and executes delayed RPC', async () => {
    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    }

    pikkuState(null, 'package', 'singletonServices', {
      logger,
    } as any)

    const scheduler = new InMemorySchedulerService()
    try {
      const taskId = await scheduler.scheduleRPC(50, 'testRpc', { ok: true }, {
        userId: 'user-1',
      } as any)
      assert.ok(taskId)

      const task = await scheduler.getTask(taskId)
      assert.ok(task)
      assert.equal(task.rpcName, 'testRpc')
    } finally {
      await scheduler.close()
    }
  })
})
