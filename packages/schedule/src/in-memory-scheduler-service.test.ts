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

describe('InMemorySchedulerService getTaskRuns', () => {
  test('records each cron run with its outcome, and the next run', async () => {
    const logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    }
    pikkuState(null, 'package', 'singletonServices', { logger } as any)

    const wire = (name: string, func: (...args: any[]) => Promise<void>) => {
      const pikkuFuncId = `scheduler_${name}`
      pikkuState(null, 'scheduler', 'meta')[name] = {
        pikkuFuncId,
        name,
        schedule: '* * * * * *',
      }
      pikkuState(null, 'function', 'meta')[pikkuFuncId] = {
        pikkuFuncId,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      } as any
      addFunction(pikkuFuncId, { func, auth: false } as any)
      pikkuState(null, 'scheduler', 'tasks').set(name, {
        name,
        schedule: '* * * * * *',
        func: { func, auth: false },
      } as any)
    }
    wire('passes', async () => {})
    wire('throws', async () => {
      throw new Error('boom')
    })
    wire('skips', async (_services, _data, { scheduledTask }) => {
      scheduledTask.skip('nothing to do')
    })

    const scheduler = new InMemorySchedulerService()
    try {
      await scheduler.start()
      const ran = await waitFor(
        () =>
          ['passes', 'throws', 'skips'].every(
            (name) => (scheduler as any).taskRuns.get(name)?.length > 0
          ),
        3000
      )
      assert.ok(ran)

      const runs = await scheduler.getTaskRuns()
      assert.equal(runs.passes!.lastRun!.status, 'completed')
      assert.equal(runs.passes!.lastRun!.error, null)
      assert.equal(runs.throws!.lastRun!.status, 'failed')
      assert.match(runs.throws!.lastRun!.error!, /boom/)
      assert.equal(runs.skips!.lastRun!.status, 'skipped')
      assert.ok(runs.passes!.nextRun! > runs.passes!.lastRun!.startedAt)
      assert.equal(runs.passes!.history[0], runs.passes!.lastRun)
    } finally {
      await scheduler.close()
      pikkuState(null, 'scheduler', 'tasks').clear()
    }
  })
})
