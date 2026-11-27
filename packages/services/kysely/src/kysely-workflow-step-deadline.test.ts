/**
 * A step's `timeout` against a real `KyselyWorkflowService`: what is stored with
 * the step is what ends a hung attempt, whichever worker picks it up.
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
import { KyselyWorkflowMirror } from './kysely-workflow-mirror.js'
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

/** Plays the workers, handing a job that threw back as often as `deliveries` allows. */
const pumpRedelivering = async (deliveries: number) => {
  const delivered = new Map<string, number>()
  for (let i = 0; i < 200 && queue.length > 0; i++) {
    const job = queue.shift()!
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
    } catch {
      const key = `${job.runId}:${job.stepName}`
      const count = (delivered.get(key) ?? 1) + 1
      delivered.set(key, count)
      if (count <= deliveries) queue.push(job)
    }
  }
  assert.equal(queue.length, 0, 'queue did not drain')
}

const hang = () => new Promise<never>(() => {})

const history = async (runId: string) =>
  (await service.getRunHistory(runId)).filter((s) => s.stepName === 'Work')

describe('a hung step with a timeout', () => {
  test(
    'queued: each attempt fails, it retries, then the run fails',
    { timeout: 5_000 },
    async () => {
      step('work', hang)
      workflow('flow', async (wire) => {
        await wire.do('Work', 'work', {}, { retries: 1, timeout: 30 })
      })

      const runId = await start('flow')
      await pumpRedelivering(2)

      assert.deepEqual(calls, ['work', 'work'])
      assert.equal((await run(runId)).status, 'failed')
      const attempts = await history(runId)
      assert.deepEqual(
        attempts.map((a) => a.status),
        ['failed', 'failed']
      )
      assert.match(attempts.at(-1)!.error!.message!, /timed out after 30ms/)
    }
  )

  test(
    'the timeout survives a lost job that recovery sends again',
    { timeout: 5_000 },
    async () => {
      step('work', hang)
      workflow('flow', async (wire) => {
        await wire.do('Work', 'work', {}, { retries: 0, timeout: 30 })
      })
      loseJob = (job) => job.stepName === 'Work'

      const runId = await start('flow')
      await pump()
      assert.deepEqual(calls, [])

      await recoverAndFinish()

      assert.deepEqual(calls, ['work'])
      assert.equal((await run(runId)).status, 'failed')
      assert.match(
        (await history(runId)).at(-1)!.error!.message!,
        /timed out after 30ms/
      )
    }
  )
})

describe('the workflow mirror', () => {
  test('keeps a step’s timeout', async () => {
    const mirror = new KyselyWorkflowMirror(db)
    const runId = await service.createRun('flow', {}, false, 'h1', {
      type: 'test',
    } as any)
    const now = new Date()

    await mirror.insertStepState(runId, {
      stepId: 'mirrored-step',
      stepName: 'Work',
      rpcName: 'work',
      data: {},
      status: 'pending',
      attemptCount: 1,
      timeout: '30ms',
      createdAt: now,
      updatedAt: now,
    })

    assert.equal((await service.getStepState(runId, 'Work')).timeout, '30ms')
  })
})
