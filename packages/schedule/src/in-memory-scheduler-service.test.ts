import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { InMemorySchedulerService } from './in-memory-scheduler-service.js'

const waitFor = async (predicate: () => boolean, withinMs = 2000) => {
  const deadline = Date.now() + withinMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
}

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

  /**
   * The delay actually has to invoke the RPC, with its data.
   *
   * The test above only proved the task was registered, which is why the
   * scheduler could dispatch through `runScheduledTask` — a lookup against the
   * *cron task* registry that no scheduled RPC is ever in — and still pass.
   * Every internally scheduled RPC failed with ScheduledTaskNotFoundError,
   * `pikkuWorkflowSleeper` among them, so an async workflow never woke from
   * `workflow.sleep`.
   */
  test('invokes the named RPC with its data once the delay elapses', async () => {
    const errors: string[] = []
    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: (message: string) => errors.push(message),
    }
    pikkuState(null, 'package', 'singletonServices', { logger } as any)

    const calls: unknown[] = []
    addFunction(
      'delayedTestRpc',
      {
        func: async (_services: any, data: unknown) => calls.push(data),
      } as any,
      null
    )
    pikkuState(null, 'function', 'meta')['delayedTestRpc'] = {
      name: 'delayedTestRpc',
      sessionless: true,
      permissions: [],
    } as any

    const scheduler = new InMemorySchedulerService()
    try {
      await scheduler.scheduleRPC(20, 'delayedTestRpc', {
        runId: 'run-1',
        stepId: 'step-1',
      })
      assert.ok(
        await waitFor(() => calls.length > 0),
        `RPC was never invoked; scheduler errors: ${JSON.stringify(errors)}`
      )
      assert.deepEqual(calls[0], { runId: 'run-1', stepId: 'step-1' })
    } finally {
      await scheduler.close()
    }
  })
})
