/**
 * Each test loses one message or hand-back, runs the recovery pass, then plays
 * the workers until the queue is empty. It asserts how the run ends and how
 * often each side effect happened, not only that recovery picked the run up.
 */
import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

import { addWorkflow, type WorkflowServiceOptions } from '@pikku/core/workflow'
import { InMemoryLeaseService } from '@pikku/core/services'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'
import { applyPikkuSchemas, workflowSchema } from './schema/index.js'

const HOUR = 60 * 60_000

type Job = { runId: string; stepName?: string; rpcName?: string; data?: any }

let db: Kysely<KyselyPikkuDB>
let service: KyselyWorkflowService
let queue: Job[]
let calls: string[]
let handlers: Record<string, () => unknown>
let loseJob: (job: Job) => boolean

const rpc: any = {
  rpcWithWire: async (name: string) => {
    calls.push(name)
    return handlers[name]!()
  },
}

beforeEach(async () => {
  resetPikkuState()
  db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [workflowSchema])
  service = new KyselyWorkflowService(db, {
    wireQueues: false,
    leaseService: new InMemoryLeaseService(),
  } as WorkflowServiceOptions)
  await service.init()
  queue = []
  calls = []
  handlers = {}
  loseJob = () => false
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    queueService: {
      add: async (_queue: string, data: Job) => {
        if (!loseJob(data)) queue.push(data)
        return 'job'
      },
    },
    workflowService: service,
  } as never)
})

afterEach(async () => {
  service.stopRecovery()
  await db.destroy()
})

const step = (
  name: string,
  handler: () => unknown,
  options: { compensate?: () => unknown } = {}
) => {
  handlers[name] = handler
  if (options.compensate) handlers[`${name}:compensate`] = options.compensate
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    sessionless: true,
    permissions: [],
    workflowQueued: true,
    ...(options.compensate ? { compensate: true } : {}),
  } as never
}

const workflow = (name: string, body: (wire: any) => Promise<unknown>) => {
  pikkuState(null, 'workflows', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    source: 'dsl',
    graphHash: `${name}-hash`,
  } as never
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    sessionless: true,
    permissions: [],
  } as never
  addWorkflow(name, {
    func: async (_services: any, _input: any, wire: any) => body(wire.workflow),
  } as never)
}

const runJob = async (job: Job) => {
  try {
    if (job.stepName === undefined) {
      await service.orchestrateWorkflow(job.runId, rpc)
    } else {
      await service.executeWorkflowStep(
        job.runId,
        job.stepName,
        job.rpcName!,
        job.data,
        rpc
      )
    }
  } catch {}
}

const pump = async () => {
  for (let i = 0; i < 200 && queue.length > 0; i++) {
    await runJob(queue.shift()!)
  }
  assert.equal(queue.length, 0, 'queue did not drain')
}

const start = async (name: string) =>
  (await service.startWorkflow(name, {}, { type: 'test' }, rpc)).runId

/** Makes every run and step look untouched for an hour. */
const goQuiet = async () => {
  const then = new Date(Date.now() - HOUR)
  await db.updateTable('workflowRuns').set({ updatedAt: then }).execute()
  await db.updateTable('workflowStep').set({ updatedAt: then }).execute()
}

const recoverAndFinish = async () => {
  loseJob = () => false
  await goQuiet()
  await service.recoverWorkflows()
  await pump()
}

const run = async (runId: string) => (await service.getRun(runId))!

const childStatus = async () =>
  (
    await db
      .selectFrom('workflowRuns')
      .select('status')
      .where('workflow', '=', 'childWorkflow')
      .executeTakeFirstOrThrow()
  ).status

const count = (name: string) => calls.filter((c) => c === name).length

/** The child ends, but the process dies before telling its parent. */
const loseHandBack = () => {
  const internals = service as any
  const completed = internals.onChildWorkflowCompleted
  const failed = internals.onChildWorkflowFailed
  internals.onChildWorkflowCompleted = async () => {}
  internals.onChildWorkflowFailed = async () => {}
  return () => {
    internals.onChildWorkflowCompleted = completed
    internals.onChildWorkflowFailed = failed
  }
}

describe('recovering a parent whose child already settled', () => {
  const parentAndChild = (childBody: () => unknown) => {
    step('childWork', childBody)
    workflow('childWorkflow', (w) =>
      w.do('Child work', 'childWork', {}, { retries: 0 })
    )
    pikkuState(null, 'function', 'meta')['childWorkflow'].workflowQueued = true
    workflow('parentWorkflow', (w) => w.do('Run child', 'childWorkflow', {}))
  }

  test('a completed child hands its output to the parent and is not started again', async () => {
    parentAndChild(() => ({ pages: 3 }))
    const restore = loseHandBack()
    const parentId = await start('parentWorkflow')
    await pump()
    restore()
    assert.equal(await childStatus(), 'completed')
    assert.equal((await run(parentId)).status, 'running')

    await recoverAndFinish()

    assert.equal((await run(parentId)).status, 'completed')
    assert.deepEqual((await run(parentId)).output, { pages: 3 })
    assert.equal(count('childWork'), 1)
  })

  test('a failed child fails the parent and is not started again', async () => {
    parentAndChild(() => {
      throw new Error('page unreachable')
    })
    const restore = loseHandBack()
    const parentId = await start('parentWorkflow')
    await pump()
    restore()
    assert.equal(await childStatus(), 'failed')
    assert.equal((await run(parentId)).status, 'running')
    const attempts = count('childWork')

    await recoverAndFinish()

    assert.equal((await run(parentId)).status, 'failed')
    assert.match((await run(parentId)).error!.message!, /page unreachable/)
    assert.equal(count('childWork'), attempts)
  })

  test('a cancelled child fails the parent and is not started again', async () => {
    parentAndChild(() => ({}))
    loseJob = (job) => job.rpcName === 'childWork'
    const parentId = await start('parentWorkflow')
    await pump()
    const [parked] = await service.getRunSteps(parentId)
    const restore = loseHandBack()
    await service.cancelRun(parked!.childRunId!)
    await pump()
    restore()
    assert.equal(await childStatus(), 'cancelled')
    assert.equal((await run(parentId)).status, 'running')

    await recoverAndFinish()

    assert.equal((await run(parentId)).status, 'failed')
    assert.match((await run(parentId)).error!.message!, /cancelled/)
    assert.equal(count('childWork'), 0)
  })

  test('replaying a parent while its child is live does not start a second child', async () => {
    parentAndChild(() => ({}))
    loseJob = (job) => job.rpcName === 'childWork'
    const parentId = await start('parentWorkflow')
    await pump()
    loseJob = () => false
    const children = async () =>
      (await db.selectFrom('workflowRuns').select('workflow').execute()).filter(
        (r) => r.workflow === 'childWorkflow'
      ).length
    assert.equal(await children(), 1)

    await service.resumeWorkflow(parentId)
    await pump()

    assert.equal(await children(), 1)
  })

  for (const message of ['replay of the parent', 'redelivered step job']) {
    test(`a worker that died holding a parked step: a ${message} starts no second child`, async () => {
      parentAndChild(() => ({}))
      let stepJob: Job | undefined
      loseJob = (job) => {
        if (job.rpcName === 'childWorkflow') stepJob = job
        return job.rpcName === 'childWork'
      }
      const parentId = await start('parentWorkflow')
      await pump()
      loseJob = () => false
      await db
        .updateTable('workflowStep')
        .set({ leaseExpiresAt: Date.now() - 1000 })
        .where('workflowRunId', '=', parentId)
        .execute()

      if (message === 'redelivered step job') queue.push(stepJob!)
      else await service.resumeWorkflow(parentId)
      await pump()

      const children = await db
        .selectFrom('workflowRuns')
        .select('workflowRunId')
        .where('workflow', '=', 'childWorkflow')
        .execute()
      assert.equal(children.length, 1)
    })
  }

  test('a just-cancelled child is given time to start its unwind', async () => {
    parentAndChild(() => ({}))
    loseJob = (job) => job.rpcName === 'childWork'
    const parentId = await start('parentWorkflow')
    await pump()
    const [parked] = await service.getRunSteps(parentId)
    loseHandBack()
    await service.cancelRun(parked!.childRunId!)
    await pump()
    await goQuiet()
    await db
      .updateTable('workflowRuns')
      .set({ updatedAt: new Date() })
      .where('workflowRunId', '=', parked!.childRunId!)
      .execute()

    await service.recoverWorkflows()

    const [after] = await service.getRunSteps(parentId)
    assert.equal(after!.status, 'running')
  })

  test('a new attempt at a step does not inherit the last attempt’s child', async () => {
    const runId = await service.createRun('parentWorkflow', {}, false, 'h', {
      type: 'test',
    } as never)
    const parked = await service.insertStepState(runId, 'child', 'child', {})
    await service.setStepRunning(parked.stepId)
    await service.setStepChildRunId(parked.stepId, 'old-child')
    await service.setStepError(parked.stepId, new Error('old child failed'))

    await (service as any).claimStepForExecution(runId, 'child', 'child', HOUR)

    const [retried] = await service.getRunSteps(runId)
    assert.equal(retried!.childRunId, undefined)
  })
})

describe('recovering a run left compensating', () => {
  let undone: number
  const booking = () => {
    undone = 0
    step('reserve', () => ({}), { compensate: () => void undone++ })
    step('charge', () => {
      throw new Error('card declined')
    })
    workflow('bookingWorkflow', async (w) => {
      await w.do('Reserve', 'reserve', {})
      await w.do('Charge', 'charge', {}, { retries: 0 })
    })
  }

  const stuckUnwinding = async (lose: (job: Job) => boolean) => {
    booking()
    loseJob = lose
    const runId = await start('bookingWorkflow')
    await pump()
    assert.equal((await run(runId)).status, 'compensating')
    return runId
  }

  test('a lost compensation job is sent again and the unwind finishes', async () => {
    const runId = await stuckUnwinding(
      (job) => job.rpcName === 'reserve:compensate'
    )

    await recoverAndFinish()

    assert.equal((await run(runId)).status, 'compensated')
    assert.equal(undone, 1)
  })

  test('a lost forward step of a cancelled run is not sent again', async () => {
    step('reserve', () => ({}), { compensate: () => ({}) })
    step('sendEmail', () => ({}))
    workflow('mailWorkflow', async (w) => {
      await w.do('Reserve', 'reserve', {})
      await w.do('Email', 'sendEmail', {})
    })
    loseJob = (job) => job.rpcName === 'sendEmail'
    const runId = await start('mailWorkflow')
    await pump()
    loseJob = (job) => job.rpcName === 'reserve:compensate'
    await service.cancelRun(runId, rpc)
    await pump()
    assert.equal((await run(runId)).status, 'compensating')
    const email = (await service.getRunSteps(runId)).find(
      (s) => s.stepName === 'Email'
    )

    for (const status of ['scheduled', 'pending'] as const) {
      await db
        .updateTable('workflowStep')
        .set({ status })
        .where('workflowStepId', '=', email!.stepId)
        .execute()
      await recoverAndFinish()
    }

    assert.equal(count('sendEmail'), 0)
  })

  test('a lost orchestrator job after the last undo still finishes the run', async () => {
    let undoSent = false
    const runId = await stuckUnwinding((job) => {
      if (job.rpcName === 'reserve:compensate') undoSent = true
      return undoSent && job.stepName === undefined
    })

    await recoverAndFinish()

    assert.equal((await run(runId)).status, 'compensated')
    assert.equal(undone, 1)
  })
})

describe('recovering an approval whose resume was lost', () => {
  const schema = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
    },
  }
  const payout = () => {
    step('pay', () => ({ paid: true }))
    workflow('payoutWorkflow', async (w) => {
      await w.approval('Approve payout', { schema, approvers: 'any' })
      return w.do('Pay', 'pay', {})
    })
  }

  test('a decided gate runs on to completion', async () => {
    payout()
    const runId = await start('payoutWorkflow')
    await pump()
    assert.equal((await run(runId)).status, 'suspended')
    loseJob = () => true
    await service.approveStep(runId, 'Approve payout', { ok: true })

    await recoverAndFinish()

    assert.equal((await run(runId)).status, 'completed')
    assert.equal(count('pay'), 1)
  })

  test('a decided gate is resumed however many other runs are stalled', async () => {
    payout()
    const runId = await start('payoutWorkflow')
    await pump()
    loseJob = () => true
    await service.approveStep(runId, 'Approve payout', { ok: true })
    loseJob = () => false
    await service.createRun('removedWorkflow', {}, false, 'h', {
      type: 'test',
    } as never)
    await goQuiet()

    await service.recoverStalledRuns({ stalledAfterMs: 1000, limit: 1 })

    assert.ok(queue.some((job) => job.runId === runId))
  })

  test('an undecided gate is left waiting', async () => {
    payout()
    const runId = await start('payoutWorkflow')
    await pump()
    await goQuiet()

    await service.recoverWorkflows()

    assert.deepEqual(queue, [])
    assert.equal((await run(runId)).status, 'suspended')
  })
})
