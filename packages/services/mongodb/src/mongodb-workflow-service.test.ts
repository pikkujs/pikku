import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'

import type { StepState } from '@pikku/core/workflow'
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
 * Dispatch is at-least-once — the relay re-dispatches a step it believes was
 * dropped, and a queue can redeliver a job it already handed out — so the claim
 * is the only thing standing between a duplicate dispatch and a second
 * execution of a side-effecting step.
 */
describe('claiming a step for execution', () => {
  const claim = (runId: string, stepName: string, rpcName = 'rpc.fn') =>
    (ws as any).claimStepForExecution(
      runId,
      stepName,
      rpcName
    ) as Promise<StepState | null>

  const seedRun = () =>
    ws.createRun('flow', {}, false, 'hash', { type: 'test' } as any)

  test('two dispatches racing for the same pending step: exactly one wins', async () => {
    const runId = await seedRun()
    await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })

    const claims = await Promise.all([claim(runId, 's1'), claim(runId, 's1')])
    const winners = claims.filter((c) => c !== null)

    assert.equal(
      winners.length,
      1,
      `both dispatches claimed the step, so a side-effecting step would run twice: ${JSON.stringify(claims)}`
    )
    assert.equal((await ws.getStepState(runId, 's1')).status, 'running')
  })

  test('two dispatches racing to retry the same failed step: exactly one wins', async () => {
    const runId = await seedRun()
    const step = await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await ws.setStepRunning(step.stepId)
    await ws.setStepError(step.stepId, new Error('boom'))

    const claims = await Promise.all([claim(runId, 's1'), claim(runId, 's1')])
    const winners = claims.filter((c) => c !== null)

    assert.equal(
      winners.length,
      1,
      `both dispatches started a retry, so the failed step would be retried twice concurrently: ${JSON.stringify(claims)}`
    )
    assert.equal(
      (await ws.getStepState(runId, 's1')).attemptCount,
      2,
      'the retry raced itself and burned more than one attempt'
    )
  })

  test('two dispatches racing for the same scheduled step: exactly one wins', async () => {
    const runId = await seedRun()
    const step = await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await ws.setStepScheduled(step.stepId)

    const claims = await Promise.all([claim(runId, 's1'), claim(runId, 's1')])
    const winners = claims.filter((c) => c !== null)

    assert.equal(
      winners.length,
      1,
      `both dispatches claimed the queued step, so a redelivered job would run it a second time: ${JSON.stringify(claims)}`
    )
    assert.equal((await ws.getStepState(runId, 's1')).status, 'running')
  })

  test('a step already claimed is not claimable again', async () => {
    const runId = await seedRun()
    await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })

    assert.notEqual(await claim(runId, 's1'), null)
    assert.equal(
      await claim(runId, 's1'),
      null,
      'a redelivered job re-claimed a step that is already running'
    )
  })

  test('a succeeded step is not claimable', async () => {
    const runId = await seedRun()
    const step = await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await ws.setStepRunning(step.stepId)
    await ws.setStepResult(step.stepId, { ok: true })

    assert.equal(await claim(runId, 's1'), null)
  })

  test('a claim that fails releases the step, so it is retryable', async () => {
    const runId = await seedRun()
    const step = await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })

    assert.notEqual(await claim(runId, 's1'), null)
    await ws.setStepError(step.stepId, new Error('boom'))

    const retry = await claim(runId, 's1')
    assert.notEqual(
      retry,
      null,
      'the failed step stayed claimed, so it can never be retried'
    )
    assert.equal(retry?.status, 'running')
    assert.equal(retry?.attemptCount, 2)
  })

  test('a claim for a different function than the step was dispatched with is refused', async () => {
    const runId = await seedRun()
    await ws.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })

    await assert.rejects(() => claim(runId, 's1', 'rpc.other'))
    assert.equal((await ws.getStepState(runId, 's1')).status, 'pending')
  })
})
