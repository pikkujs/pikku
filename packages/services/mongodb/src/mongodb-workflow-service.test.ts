import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { MongoDBWorkflowService } from './mongodb-workflow-service.js'

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db
let ws: MongoDBWorkflowService
let dbCount = 0

before(async () => {
  mongod = await MongoMemoryServer.create()
  client = new MongoClient(mongod.getUri())
  await client.connect()
})

after(async () => {
  await client?.close()
  await mongod?.stop()
})

beforeEach(async () => {
  db = client.db(`wf-${++dbCount}`)
  ws = new MongoDBWorkflowService(db)
  await ws.init()
})

const seedStep = async () => {
  const runId = await ws.createRun('flow', {}, false, 'hash', {
    type: 'test',
  } as any)
  const step = await ws.insertStepState(runId, 'step-1', 'rpc.fn', { x: 1 })
  return { runId, step }
}

/** The history rows of a run, oldest first. */
const historyOf = async (runId: string) => ws.getRunHistory(runId)

describe('a step transition reaches the history', () => {
  test('running stamps the attempt it is running', async () => {
    const { runId, step } = await seedStep()

    await ws.setStepRunning(step.stepId)

    const [attempt] = await historyOf(runId)
    assert.equal(attempt!.status, 'running')
    assert.ok(attempt!.runningAt, 'no runningAt, so the step has no duration')
  })

  test('scheduled stamps the attempt it is queueing', async () => {
    const { runId, step } = await seedStep()

    await ws.setStepScheduled(step.stepId)

    const [attempt] = await historyOf(runId)
    assert.equal(
      attempt!.status,
      'scheduled',
      'the history still says pending, so a queued step reads as never dispatched'
    )
    assert.ok(attempt!.scheduledAt, 'no scheduledAt on the queued attempt')
  })

  test('succeeded carries the result', async () => {
    const { runId, step } = await seedStep()

    await ws.setStepRunning(step.stepId)
    await ws.setStepResult(step.stepId, { ok: true })

    const [attempt] = await historyOf(runId)
    assert.equal(attempt!.status, 'succeeded')
    assert.deepEqual(attempt!.result, { ok: true })
    assert.ok(attempt!.succeededAt)
  })

  test('failed carries the error', async () => {
    const { runId, step } = await seedStep()

    await ws.setStepRunning(step.stepId)
    await ws.setStepError(step.stepId, new Error('exploded'))

    const [attempt] = await historyOf(runId)
    assert.equal(attempt!.status, 'failed')
    assert.equal(attempt!.error?.message, 'exploded')
    assert.ok(attempt!.failedAt)
  })

  test('a retry writes to the new attempt, leaving the failed one intact', async () => {
    const { runId, step } = await seedStep()

    await ws.setStepRunning(step.stepId)
    await ws.setStepError(step.stepId, new Error('first go'))
    await ws.createRetryAttempt(step.stepId, 'pending')
    await ws.setStepRunning(step.stepId)
    await ws.setStepResult(step.stepId, 'second go')

    const history = await historyOf(runId)
    assert.equal(history.length, 2)
    assert.equal(history[0]!.status, 'failed')
    assert.equal(history[0]!.error?.message, 'first go')
    assert.equal(history[1]!.status, 'succeeded')
    assert.equal(history[1]!.result, 'second go')
  })

  test('the step row keeps only its latest outcome', async () => {
    const { runId, step } = await seedStep()

    await ws.setStepError(step.stepId, new Error('first go'))
    await ws.createRetryAttempt(step.stepId, 'pending')
    await ws.setStepResult(step.stepId, 'second go')

    const state = await ws.getStepState(runId, 'step-1')
    assert.equal(state.status, 'succeeded')
    assert.equal(state.result, 'second go')
    assert.equal(state.error, undefined)
    assert.equal(state.attemptCount, 2)
  })
})

/**
 * `findOne` with no sort returns whatever the storage engine reaches first, so
 * a name holding several active versions resolved unpredictably.
 */
describe('resolving a dynamic workflow', () => {
  const publishVersion = async (graphHash: string, createdAt: Date) => {
    await ws.upsertWorkflowVersion(
      'dyn',
      graphHash,
      { hash: graphHash },
      'ai-agent'
    )
    await db
      .collection('workflowVersions')
      .updateOne({ workflowName: 'dyn', graphHash }, { $set: { createdAt } })
  }

  test('the newest active version wins', async () => {
    await publishVersion('older', new Date('2020-01-01T00:00:00Z'))
    await publishVersion('newer', new Date('2021-01-01T00:00:00Z'))

    const resolved = await ws.getDynamicWorkflow('dyn')

    assert.equal(
      resolved?.graphHash,
      'newer',
      'an older version resolved, so a redeploy is not picked up'
    )
  })

  test('versions sharing a timestamp resolve to the same one twice', async () => {
    const sameInstant = new Date('2020-01-01T00:00:00Z')
    await publishVersion('aaa', sameInstant)
    await publishVersion('zzz', sameInstant)

    const first = await ws.getDynamicWorkflow('dyn')
    const second = await ws.getDynamicWorkflow('dyn')

    assert.equal(first?.graphHash, second?.graphHash)
    assert.equal(first?.graphHash, 'zzz')
  })
})
