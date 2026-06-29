import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import { SerializePlugin } from './serialize-plugin.js'
import Database from 'better-sqlite3'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyWorkflowMirror } from './kysely-workflow-mirror.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'

let db: Kysely<KyselyPikkuDB>
let mirror: KyselyWorkflowMirror
let runService: KyselyWorkflowRunService

const RUN_ID = 'run-aaaa'
const STEP_ID = 'step-bbbb'

beforeEach(async () => {
  db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  mirror = new KyselyWorkflowMirror(db)
  await mirror.init()
  runService = new KyselyWorkflowRunService(db)
})

afterEach(async () => {
  await db.destroy()
})

async function seedRun(opts?: { input?: any; inline?: boolean }) {
  await mirror.createRun(
    RUN_ID,
    'wf',
    opts?.input ?? { foo: 1 },
    opts?.inline ?? false,
    'hash1',
    { type: 'do', id: RUN_ID } as any
  )
}

async function seedStep(stepId = STEP_ID, stepName = 'step1') {
  await mirror.insertStepState(RUN_ID, {
    stepId,
    stepName,
    rpcName: 'rpc.fn',
    data: { x: 1 },
    status: 'pending',
    attemptCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

describe('KyselyWorkflowMirror — runs', () => {
  test('createRun is visible to KyselyWorkflowRunService.getRun', async () => {
    await seedRun({ input: { hello: 'world' } })
    const run = await runService.getRun(RUN_ID)
    assert.ok(run)
    assert.equal(run.workflow, 'wf')
    assert.equal(run.status, 'running')
    assert.deepEqual(run.input, { hello: 'world' })
    assert.equal(run.graphHash, 'hash1')
  })

  test('updateRunStatus reflects in getRun', async () => {
    await seedRun()
    await mirror.updateRunStatus(RUN_ID, 'completed', { ok: true })
    const run = await runService.getRun(RUN_ID)
    assert.equal(run!.status, 'completed')
    assert.deepEqual(run!.output, { ok: true })
  })

  test('listRuns surfaces mirrored runs', async () => {
    await seedRun()
    const runs = await runService.listRuns()
    assert.equal(runs.length, 1)
    assert.equal(runs[0]!.id, RUN_ID)
  })

  test('getDistinctWorkflowNames returns mirrored workflow names', async () => {
    await seedRun()
    const names = await runService.getDistinctWorkflowNames()
    assert.deepEqual(names, ['wf'])
  })
})

describe('KyselyWorkflowMirror — step lifecycle', () => {
  beforeEach(async () => {
    await seedRun()
  })

  test('insertStepState creates step + initial pending history', async () => {
    await seedStep()
    const steps = await runService.getRunSteps(RUN_ID)
    assert.equal(steps.length, 1)
    assert.equal(steps[0]!.stepName, 'step1')
    assert.equal(steps[0]!.status, 'pending')

    const history = await runService.getRunHistory(RUN_ID)
    assert.equal(history.length, 1)
    assert.equal(history[0]!.status, 'pending')
  })

  test('running → succeeded updates the in-place history row', async () => {
    await seedStep()
    await mirror.setStepRunning(STEP_ID)
    await mirror.setStepResult(STEP_ID, { value: 42 })

    const steps = await runService.getRunSteps(RUN_ID)
    assert.equal(steps[0]!.status, 'succeeded')
    assert.deepEqual(steps[0]!.result, { value: 42 })

    const history = await runService.getRunHistory(RUN_ID)
    assert.equal(history.length, 1, 'updates collapse onto latest history row')
    assert.equal(history[0]!.status, 'succeeded')
    assert.deepEqual(history[0]!.result, { value: 42 })
  })

  test('setStepError stores serialized error', async () => {
    await seedStep()
    await mirror.setStepError(STEP_ID, {
      message: 'boom',
      stack: 'stack',
      code: 'EBOOM',
    })

    const steps = await runService.getRunSteps(RUN_ID)
    assert.equal(steps[0]!.status, 'failed')
    assert.equal(steps[0]!.error?.message, 'boom')
    assert.equal(steps[0]!.error?.code, 'EBOOM')
  })

  test('createRetryAttempt appends a new history row + clears result/error', async () => {
    await seedStep()
    await mirror.setStepError(STEP_ID, { message: 'first try', code: 'X' })

    await mirror.createRetryAttempt(STEP_ID, {
      stepId: STEP_ID,
      stepName: 'step1',
      status: 'pending',
      attemptCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const steps = await runService.getRunSteps(RUN_ID)
    assert.equal(steps[0]!.status, 'pending')
    assert.equal(steps[0]!.error, undefined)
    assert.equal(steps[0]!.result, undefined)

    const history = await runService.getRunHistory(RUN_ID)
    // pending (initial — collapsed onto failed) + pending (retry append)
    assert.equal(history.length, 2)
    assert.equal(history[0]!.status, 'failed')
    assert.equal(history[1]!.status, 'pending')
  })

  test('setStepChildRunId persists', async () => {
    await seedStep()
    await mirror.setStepChildRunId(STEP_ID, 'child-run-1')
    const steps = await runService.getRunSteps(RUN_ID)
    assert.equal((steps[0] as any).childRunId, 'child-run-1')
  })

  test('setBranchTaken persists the branch key', async () => {
    await seedStep()
    await mirror.setBranchTaken(STEP_ID, 'left')
    const row = await db
      .selectFrom('workflowStep')
      .select('branchTaken')
      .where('workflowStepId', '=', STEP_ID)
      .executeTakeFirst()
    assert.equal(row?.branchTaken, 'left')
  })
})

describe('KyselyWorkflowMirror — run state', () => {
  beforeEach(async () => {
    await seedRun()
  })

  test('updateRunState merges values', async () => {
    await mirror.updateRunState(RUN_ID, 'counter', 1)
    await mirror.updateRunState(RUN_ID, 'flag', true)
    const row = await db
      .selectFrom('workflowRuns')
      .select('state')
      .where('workflowRunId', '=', RUN_ID)
      .executeTakeFirst()
    const state =
      typeof row?.state === 'string' ? JSON.parse(row.state) : row?.state
    assert.deepEqual(state, { counter: 1, flag: true })
  })
})

describe('KyselyWorkflowMirror — workflow versions', () => {
  test('upsertWorkflowVersion is idempotent on (name, hash)', async () => {
    await mirror.upsertWorkflowVersion('wf', 'h1', { v: 1 }, 'graph')
    await mirror.upsertWorkflowVersion('wf', 'h1', { v: 2 }, 'graph')
    const v = await runService.getWorkflowVersion('wf', 'h1')
    assert.deepEqual(v?.graph, { v: 1 }, 'first write wins (doNothing)')
  })

  test('updateWorkflowVersionStatus mutates status', async () => {
    await mirror.upsertWorkflowVersion('wf', 'h1', {}, 'graph', 'active')
    await mirror.updateWorkflowVersionStatus('wf', 'h1', 'archived')
    const row = await db
      .selectFrom('workflowVersions')
      .select('status')
      .where('workflowName', '=', 'wf')
      .where('graphHash', '=', 'h1')
      .executeTakeFirst()
    assert.equal(row?.status, 'archived')
  })

  test('AI-generated workflows surface via getAIGeneratedWorkflows', async () => {
    await mirror.upsertWorkflowVersion(
      'ai:agent-x:foo',
      'h1',
      { nodes: [] },
      'dynamic-workflow'
    )
    const list = await runService.getAIGeneratedWorkflows('agent-x')
    assert.equal(list.length, 1)
    assert.equal(list[0]!.workflowName, 'ai:agent-x:foo')
  })
})

describe('KyselyWorkflowMirror — init', () => {
  test('init is idempotent', async () => {
    await mirror.init()
    await mirror.init()
    // No-op on second call; just shouldn't throw.
  })

  test('cohabits with KyselyWorkflowService schema (ifNotExists)', async () => {
    // Same DB, schema already created by mirror.init() in beforeEach.
    // If KyselyWorkflowService.init() ran on the same DB, both should
    // succeed because both use ifNotExists. We can't import it without
    // the singleton-services bootstrap, so simulate by re-calling our
    // own init — proves the SQL is idempotent.
    await assert.doesNotReject(mirror.init())
  })
})
