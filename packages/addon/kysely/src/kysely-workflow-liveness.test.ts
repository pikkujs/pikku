/**
 * Repro (expected to FAIL on main): a parent run parked on a child run that has
 * already settled is never a recovery candidate.
 *
 * `findStalledRunIds` (kysely-workflow-service.ts) treats a `running` step with
 * a `childRunId` as in flight unconditionally:
 *
 *   eb.and([
 *     eb('s.status', '=', 'running'),
 *     eb.or([
 *       eb('s.leaseExpiresAt', '>', this.nowMs()),
 *       eb('s.childRunId', 'is not', null),
 *     ]),
 *   ])
 *
 * It never looks at the child run. The parent is normally released by
 * `onChildWorkflowCompleted` / `onChildWorkflowFailed` when the child settles.
 * If that hand-back is lost (the process dies between the child's final status
 * write and the parent update), the parent's step stays `running` with a child
 * id, the run stays `running`, and no sweep will ever re-drive it. Nothing else
 * bounds it either: there is no idle ceiling on a run.
 *
 * The existing test "a step parked on a child run does [hold its run out of the
 * sweep]" pins the case where the child is still live (its id there is not a
 * real run). This file covers only the case where the child is already
 * terminal, which nothing is waiting on.
 *
 * Fixture provenance: derived from production-shaped runs in a downstream app,
 * anonymized. That app hit the same "running forever with nothing in flight"
 * shape for inline null-lease steps (fixed on main) and lost sleep wake-ups
 * (covered on main by the scheduled-step sweep); its runs sat `running` for
 * 11 to 25 days until an app-side reaper failed them. Its data has no
 * parent/child runs, so this fixture keeps that timing and applies it to the
 * child-run shape. Ids are generated, names are generic, and every timestamp is
 * an offset from a fixed epoch.
 */
import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

import type { WorkflowServiceOptions } from '@pikku/core/workflow'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'
import { InMemoryLeaseService } from '@pikku/core/services'
import { applyPikkuSchemas, workflowSchema } from './schema/index.js'

/** Fixed epoch every fixture timestamp is relative to. */
const EPOCH = Date.UTC(2020, 0, 1)
const at = (seconds: number) => new Date(EPOCH + seconds * 1000)
const DAY = 24 * 60 * 60

let db: Kysely<KyselyPikkuDB>
let service: KyselyWorkflowService

beforeEach(async () => {
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
})

afterEach(async () => {
  await db.destroy()
})

const backdateRun = (runId: string, created: number, updated: number) =>
  db
    .updateTable('workflowRuns')
    .set({ createdAt: at(created), updatedAt: at(updated) })
    .where('workflowRunId', '=', runId)
    .execute()

const backdateStep = (stepId: string, created: number, updated: number) =>
  db
    .updateTable('workflowStep')
    .set({ createdAt: at(created), updatedAt: at(updated) })
    .where('workflowStepId', '=', stepId)
    .execute()

/**
 * Parent `crawlWorkflow` (created at +0s) runs `fetchStep`, then parks step
 * `childStep` on child run `pageWorkflow`. The child ends at +40s; the parent's
 * hand-back is lost, so its step is still `running` with the child's id.
 */
const seedParentParkedOnSettledChild = async (
  childStatus: 'completed' | 'failed' | 'cancelled'
) => {
  const parentId = await service.createRun('crawlWorkflow', {}, false, 'h1', {
    type: 'test',
  } as any)
  const fetch = await service.insertStepState(
    parentId,
    'fetchStep',
    'fetchPage',
    {}
  )
  await service.setStepRunning(fetch.stepId)
  await service.setStepResult(fetch.stepId, {})
  await backdateStep(fetch.stepId, 0.2, 1.1)

  const childId = await service.createRun('pageWorkflow', {}, false, 'h2', {
    type: 'test',
    parentRunId: parentId,
    parentStepId: 'childStep',
  } as any)
  await service.updateRunStatus(childId, childStatus)
  await backdateRun(childId, 1.2, 40)

  const park = await service.insertStepState(
    parentId,
    'childStep',
    'pageWorkflow',
    {}
  )
  await service.setStepRunning(park.stepId)
  await service.setStepChildRunId(park.stepId, childId)
  await backdateStep(park.stepId, 1.2, 1.2)

  await backdateRun(parentId, 0, 0)
  return { parentId, childId }
}

describe('KyselyWorkflowService — a parent parked on a child that already settled', () => {
  test('control: without the child id the same quiet run is a candidate', async () => {
    const { parentId } = await seedParentParkedOnSettledChild('failed')
    await db
      .updateTable('workflowStep')
      .set({ childRunId: null })
      .where('workflowRunId', '=', parentId)
      .execute()

    // Guards the tests below: the fixture is otherwise stall-eligible, so the
    // child id is the only thing holding the parent out of the sweep.
    assert.deepEqual(
      await (service as any).findStalledRunIds(at(11 * DAY), 10),
      [parentId]
    )
  })

  for (const childStatus of ['completed', 'failed', 'cancelled'] as const) {
    test(`child ${childStatus}: the quiet parent is a stalled-run candidate`, async () => {
      const { parentId } = await seedParentParkedOnSettledChild(childStatus)

      // The sweep asks 11 days later, the shortest time a run of this shape
      // sat `running` in the source data.
      const before = at(11 * DAY)
      const stalled: string[] = await (service as any).findStalledRunIds(
        before,
        10
      )

      assert.equal((await service.getRun(parentId))?.status, 'running')
      assert.deepEqual(
        stalled,
        [parentId],
        `the parent has been quiet for 11 days and its child run is '${childStatus}', yet findStalledRunIds excludes it because the step has a childRunId`
      )
    })
  }
})
