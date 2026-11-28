/**
 * What an inline pass owes a run on a store with a real run lease: it sits out no
 * wait a cancel has overtaken, and lets go only once its steps have ended.
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

const WAIT = '3s'

let db: Kysely<KyselyPikkuDB>
let runner: KyselyWorkflowService
let other: KyselyWorkflowService
let log: string[]
let handlers: Record<string, () => unknown>

const rpc: any = {
  rpcWithWire: async (name: string) => {
    log.push(name)
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
  const leaseService = new InMemoryLeaseService()
  const options = { wireQueues: false, leaseService } as WorkflowServiceOptions
  runner = new KyselyWorkflowService(db, options)
  other = new KyselyWorkflowService(db, options)
  await runner.init()
  ;(runner as any).cancelCheckIntervalMs = 20
  log = []
  handlers = {}
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    workflowService: runner,
  } as never)
})

afterEach(async () => {
  await db.destroy()
})

const step = (name: string, handler: () => unknown, undo = false) => {
  handlers[name] = handler
  if (undo) handlers[`${name}:compensate`] = () => {}
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    sessionless: true,
    permissions: [],
    ...(undo ? { compensate: true } : {}),
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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const settledWithin = (work: Promise<unknown>, ms: number) =>
  Promise.race([work.then(() => true), pause(ms).then(() => false)])

const startInline = (name: string) => {
  let created!: (runId: string) => void
  const runId = new Promise<string>((resolve) => (created = resolve))
  const ended = runner
    .startWorkflow(name, {}, { type: 'test' }, rpc, {
      inline: true,
      onRunCreated: created,
    })
    .then(() => {})
  return { runId, ended }
}

const stepStatus = async (runId: string, stepName: string) =>
  (await runner.getRunSteps(runId))
    .filter((s) => s.stepName === stepName)
    .at(-1)?.status

const until = async (condition: () => Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await condition()) return
    await pause(5)
  }
  assert.fail('the condition never held')
}

describe('an inline pass on a Kysely store', () => {
  const failsOnce = () => {
    let calls = 0
    return () => {
      if (calls++ === 0) throw new Error('once')
      return {}
    }
  }

  const waits = [
    {
      name: 'sleep',
      waiting: 'wait',
      define: () =>
        workflow('flow', async (wire) => {
          await wire.do('first', 'first', {})
          await wire.sleep('wait', WAIT)
          await wire.do('after', 'after', {})
        }),
    },
    {
      name: 'retryDelay',
      waiting: 'flaky',
      define: () => {
        step('flaky', failsOnce())
        workflow('flow', async (wire) => {
          await wire.do('first', 'first', {})
          await wire.do('flaky', 'flaky', {}, { retryDelay: WAIT })
          await wire.do('after', 'after', {})
        })
      },
    },
  ]

  for (const wait of waits) {
    for (const canceller of ['the same', 'another'] as const) {
      test(`a ${wait.name} ends with a cancel from ${canceller} instance`, async () => {
        step('first', () => ({}), true)
        step('after', () => ({}))
        wait.define()

        const started = startInline('flow')
        const runId = await started.runId
        await until(
          async () => (await stepStatus(runId, wait.waiting)) === 'pending'
        )
        await pause(40)
        await (canceller === 'the same' ? runner : other).cancelRun(runId, rpc)

        assert.equal(await settledWithin(started.ended, 1000), true)
        assert.equal((await runner.getRun(runId))?.status, 'compensated')
        assert.ok(log.includes('first:compensate'))
        assert.ok(!log.includes('after'))
        assert.notEqual(await stepStatus(runId, wait.waiting), 'succeeded')
      })
    }
  }

  test('a failing step does not end the pass under a running sibling', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    step('slow', () => gate.then(() => ({})), true)
    step('boom', () => {
      throw new Error('boom')
    })
    workflow('flow', async (wire) => {
      await Promise.all([
        wire.do('slow', 'slow', {}, { retries: 0 }),
        wire.do('boom', 'boom', {}, { retries: 0 }),
      ])
    })

    const started = startInline('flow')
    const ended = started.ended.catch(() => {})
    const runId = await started.runId
    await until(async () => (await stepStatus(runId, 'boom')) === 'failed')

    assert.equal(await settledWithin(ended, 100), false)
    release()
    await ended

    assert.equal((await runner.getRun(runId))?.status, 'compensated')
    assert.ok(log.includes('slow:compensate'))
  })
})
