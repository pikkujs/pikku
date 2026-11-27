/**
 * Repros (expected to FAIL on main): three run shapes the recovery pass never
 * brings back, however many times it sweeps.
 *
 * Every test drives `recoverWorkflows`, the pass `startRecovery` runs at boot
 * and on its interval, against a real `KyselyWorkflowService`. Nothing in the
 * service is stubbed. The only test double is the queue, which records the
 * orchestrator jobs the pass hands out, because "was the run handed back to an
 * orchestrator" is the question.
 *
 * 1. A step whose worker is hung but still renewing its lease. The renewal
 *    (`startStepLeaseRefresh` -> `refreshStepLease`) runs on a timer, not on
 *    the step's progress, so a hung promise keeps the step looking owned and
 *    the run looking active. There is no step deadline (`WorkflowStepOptions`
 *    reserves `// Future: timeout`), so the run stays `running` for good. The
 *    inline variant is the same thing one level up: a pass whose `holdLease`
 *    keeps renewing the run lease while a step inside it never settles.
 * 2. A run left `compensating` by a process that died mid-unwind. No job is
 *    coming for it, so recovery has to drive the unwind itself.
 * 3. A run `suspended` on an approval gate whose decision was recorded but whose
 *    resume never reached the queue. `recordApprovalDecision` writes the
 *    decision, then calls `resumeWorkflow`: two writes to two systems, the
 *    shape the stalled-run sweep exists for. The sweep only selects `running`
 *    runs, so the decided run stays `suspended`.
 *
 * Each gap has a passing control: the same fixture with the one thing that
 * holds it out of the sweep removed is resumed by the first pass, so the
 * failures are not fixture errors.
 *
 * Fixtures are anonymized shapes: generic names, generated ids, times relative
 * to now. The gaps are reproduced, not observed in production data.
 */
import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

import type { WorkflowServiceOptions } from '@pikku/core/workflow'
import { InMemoryLeaseService } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'
import { applyPikkuSchemas, workflowSchema } from './schema/index.js'

const MIN = 60_000
const HOUR = 60 * MIN
/** Sweeps each gap test gives the pass before calling the run stuck. */
const SWEEPS = 3

let db: Kysely<KyselyPikkuDB>
let service: KyselyWorkflowService
let leases: InMemoryLeaseService
let orchestrated: string[] = []
let rejectAdds = false

const quiet = { error() {}, info() {}, warn() {}, debug() {} }

beforeEach(async () => {
  db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [workflowSchema])
  leases = new InMemoryLeaseService()
  service = new KyselyWorkflowService(db, {
    wireQueues: false,
    leaseService: leases,
  } as WorkflowServiceOptions)
  await service.init()
  orchestrated = []
  rejectAdds = false
  pikkuState(null, 'package', 'singletonServices', {
    logger: quiet,
    queueService: {
      add: async (
        _queue: string,
        data: { runId: string; stepName?: string }
      ) => {
        if (rejectAdds) throw new Error('process died before the job was sent')
        if (data.stepName === undefined) orchestrated.push(data.runId)
        return `job-${orchestrated.length}`
      },
    },
    workflowService: service,
  } as never)
})

afterEach(async () => {
  service.stopRecovery()
  await db.destroy()
})

const ago = (ms: number) => new Date(Date.now() - ms)

const backdateRun = (runId: string, ms: number) =>
  db
    .updateTable('workflowRuns')
    .set({ createdAt: ago(ms), updatedAt: ago(ms) })
    .where('workflowRunId', '=', runId)
    .execute()

const backdateSteps = (runId: string, ms: number) =>
  db
    .updateTable('workflowStep')
    .set({ createdAt: ago(ms), updatedAt: ago(ms) })
    .where('workflowRunId', '=', runId)
    .execute()

/** One recovery pass; reports whether it handed `runId` to an orchestrator. */
const sweep = async (runId: string): Promise<boolean> => {
  orchestrated = []
  await service.recoverWorkflows()
  return orchestrated.includes(runId)
}

/** A run whose first step succeeded and whose second is `running`. */
const seedRunningStep = async () => {
  const runId = await service.createRun('importWorkflow', {}, false, 'h1', {
    type: 'test',
  } as any)
  const first = await service.insertStepState(
    runId,
    'loadInput',
    'loadInput',
    {}
  )
  await service.setStepRunning(first.stepId)
  await service.setStepResult(first.stepId, {})
  const second = await service.insertStepState(
    runId,
    'processBatch',
    'processBatch',
    {}
  )
  await service.setStepRunning(second.stepId)
  return { runId, stepId: second.stepId }
}

describe('recovery gap: a hung step that keeps renewing its lease', () => {
  test(
    'a queued step hung for 6 hours under a renewed lease is never recovered',
    { todo: 'steps have no deadline' },
    async () => {
      const { runId, stepId } = await seedRunningStep()
      await backdateRun(runId, 6 * HOUR)
      await backdateSteps(runId, 6 * HOUR)

      const recovered: boolean[] = []
      for (let i = 0; i < SWEEPS; i++) {
        // The worker's renewal timer fires; the step's own promise never settles.
        assert.equal(await service.refreshStepLease(stepId, 5 * MIN), true)
        recovered.push(await sweep(runId))
      }

      assert.equal((await service.getRun(runId))?.status, 'running')
      assert.ok(
        recovered.includes(true),
        `the step has been running for 6 hours and ${SWEEPS} recovery passes never handed the run back: a renewed lease holds it out of every sweep, and no step deadline exists`
      )
    }
  )

  test(
    'an inline step hung inside a live pass (run lease renewed) is never recovered',
    { todo: 'steps have no deadline' },
    async () => {
      const { runId } = await seedRunningStep()
      await backdateRun(runId, 6 * HOUR)
      await backdateSteps(runId, 6 * HOUR)

      // The pass that owns the run is alive and renewing: its holdLease loop
      // keeps the run lease fresh while the inline step's promise never settles.
      let lease = await leases.acquire(
        `workflow-run:${runId}`,
        'hung-pass',
        MIN
      )
      const recovered: boolean[] = []
      for (let i = 0; i < SWEEPS; i++) {
        lease = await leases.refresh(lease!, MIN)
        recovered.push(await sweep(runId))
      }

      assert.equal((await service.getRun(runId))?.status, 'running')
      assert.ok(
        recovered.includes(true),
        `the inline step has been running for 6 hours and ${SWEEPS} recovery passes never handed the run back: the renewed run lease answers for it, and no step deadline exists`
      )
    }
  )

  test('control: once the renewals stop, the same run is resumed', async () => {
    const { runId, stepId } = await seedRunningStep()
    await backdateRun(runId, 6 * HOUR)
    await service.refreshStepLease(stepId, 5 * MIN)
    // The worker died: its lease lapsed and nothing has touched the step since.
    await db
      .updateTable('workflowStep')
      .set({ leaseExpiresAt: Date.now() - MIN })
      .where('workflowStepId', '=', stepId)
      .execute()
    await backdateSteps(runId, 6 * HOUR)

    assert.equal(await sweep(runId), true)
  })

  test('control: once the pass holding the run lease is gone, the inline run is resumed', async () => {
    const { runId } = await seedRunningStep()
    await backdateRun(runId, 6 * HOUR)
    await backdateSteps(runId, 6 * HOUR)
    const lease = await leases.acquire(
      `workflow-run:${runId}`,
      'dead-pass',
      MIN
    )
    await leases.release(lease!)

    assert.equal(await sweep(runId), true)
  })
})

describe('recovery gap: a run left compensating by a process that died mid-unwind', () => {
  const seedUnwound = async (status: 'compensating' | 'running') => {
    const runId = await service.createRun('bookingWorkflow', {}, false, 'h1', {
      type: 'test',
    } as any)
    const reserve = await service.insertStepState(
      runId,
      'reserveSlot',
      'reserveSlot',
      {}
    )
    await service.setStepRunning(reserve.stepId)
    await service.setStepResult(reserve.stepId, {})
    // cancelRun moved the run to `compensating`; the process died before the
    // unwind finished, so nothing settled it.
    await service.updateRunStatus(runId, status)
    await backdateRun(runId, 2 * HOUR)
    await backdateSteps(runId, 2 * HOUR)
    return runId
  }

  test('a run compensating for 2 hours with no unwind in flight is never recovered', async () => {
    const runId = await seedUnwound('compensating')

    for (let i = 0; i < SWEEPS; i++) await sweep(runId)

    // Recovery drives the unwind itself; with nothing to undo, the run failed.
    assert.equal((await service.getRun(runId))?.status, 'failed')
    assert.deepEqual(orchestrated, [])
  })

  test('control: the same quiet run in `running` is resumed', async () => {
    const runId = await seedUnwound('running')
    assert.equal(await sweep(runId), true)
  })
})

describe('recovery gap: a run suspended on an approval whose resume was lost', () => {
  const REASON = 'Approve payout'

  const seedDecidedGate = async (status: 'suspended' | 'running') => {
    const runId = await service.createRun('payoutWorkflow', {}, false, 'h1', {
      type: 'test',
    } as any)
    // What the approval gate leaves while it waits: its step `running`, the
    // run `suspended`.
    const gate = await service.insertStepState(
      runId,
      `__workflow_approval:${REASON}`,
      'pikkuWorkflowApproval',
      { reason: REASON }
    )
    await service.setStepRunning(gate.stepId)
    await service.updateRunStatus(runId, 'suspended')

    // The decision is written; the resume that follows it never reaches the
    // queue (the process dies between the two).
    rejectAdds = true
    await assert.rejects(service.approveStep(runId, REASON, { ok: true }))
    rejectAdds = false
    const state = await service.getRunState(runId)
    assert.ok(
      Object.values(state).some((v: any) => v?.decision?.ok === true),
      'fixture: the decision was recorded'
    )

    if (status === 'running') await service.updateRunStatus(runId, 'running')
    await backdateRun(runId, 2 * HOUR)
    await backdateSteps(runId, 2 * HOUR)
    return runId
  }

  test('a run with a recorded approval but no resume is never recovered', async () => {
    const runId = await seedDecidedGate('suspended')

    const recovered: boolean[] = []
    for (let i = 0; i < SWEEPS; i++) recovered.push(await sweep(runId))

    assert.equal((await service.getRun(runId))?.status, 'suspended')
    assert.ok(
      recovered.includes(true),
      `the approval was decided 2 hours ago but its resume was lost, and ${SWEEPS} recovery passes never handed the run back; findStalledRunIds selects only 'running' runs`
    )
  })

  test('control: the same quiet run in `running` is resumed', async () => {
    const runId = await seedDecidedGate('running')
    assert.equal(await sweep(runId), true)
  })
})
