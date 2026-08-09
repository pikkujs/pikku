import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { PikkuWorkflowService } from '../../wirings/workflow/pikku-workflow-service.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `workflowService`. Runs only when a backend supplies one. */
export const defineWorkflowServiceTests = (
  name: string,
  workflowService: NonNullable<ServiceTestConfig['services']['workflowService']>
): void => {
  const factory = workflowService
  const wire = { type: 'test' }

  describe(`WorkflowService [${name}]`, () => {
    let service: PikkuWorkflowService

    before(async () => {
      service = await factory()
    })

    test('createRun and getRun', async () => {
      const runId = await service.createRun(
        'test-workflow',
        { key: 'value' },
        false,
        'hash-1',
        wire
      )

      assert.ok(runId)
      const run = await service.getRun(runId)
      assert.ok(run)
      assert.equal(run.workflow, 'test-workflow')
      assert.equal(run.status, 'running')
      assert.deepEqual(run.input, { key: 'value' })
      assert.equal(run.graphHash, 'hash-1')
    })

    test('updateRunStatus', async () => {
      const runId = await service.createRun(
        'status-workflow',
        {},
        false,
        'hash-2',
        wire
      )
      await service.updateRunStatus(runId, 'completed', { result: 'done' })

      const run = await service.getRun(runId)
      assert.ok(run)
      assert.equal(run.status, 'completed')
      assert.deepEqual(run.output, { result: 'done' })
    })

    test('insertStepState and getStepState', async () => {
      const runId = await service.createRun(
        'step-workflow',
        {},
        false,
        'hash-3',
        wire
      )

      const step = await service.insertStepState(
        runId,
        'step-1',
        'myRpc',
        { data: 'test' },
        { retries: 3, retryDelay: '1000' }
      )

      assert.ok(step.stepId)
      assert.equal(step.status, 'pending')
      assert.equal(step.attemptCount, 1)
      assert.equal(step.retries, 3)
      assert.equal(step.retryDelay, '1000')

      const fetched = await service.getStepState(runId, 'step-1')
      assert.equal(fetched.stepId, step.stepId)
      assert.equal(fetched.status, 'pending')
      assert.equal(fetched.attemptCount, 1)
    })

    test('setStepRunning, setStepResult', async () => {
      const runId = await service.createRun(
        'result-workflow',
        {},
        false,
        'hash-4',
        wire
      )
      const step = await service.insertStepState(
        runId,
        'result-step',
        'myRpc',
        {}
      )

      await service.setStepRunning(step.stepId)
      let fetched = await service.getStepState(runId, 'result-step')
      assert.equal(fetched.status, 'running')

      await service.setStepResult(step.stepId, { answer: 42 })
      fetched = await service.getStepState(runId, 'result-step')
      assert.equal(fetched.status, 'succeeded')
      assert.deepEqual(fetched.result, { answer: 42 })
    })

    test('setStepError', async () => {
      const runId = await service.createRun(
        'error-workflow',
        {},
        false,
        'hash-5',
        wire
      )
      const step = await service.insertStepState(
        runId,
        'error-step',
        'myRpc',
        {}
      )

      await service.setStepRunning(step.stepId)
      await service.setStepError(step.stepId, new Error('boom'))

      const fetched = await service.getStepState(runId, 'error-step')
      assert.equal(fetched.status, 'failed')
      assert.equal(fetched.error?.message, 'boom')
    })

    test('createRetryAttempt', async () => {
      const runId = await service.createRun(
        'retry-workflow',
        {},
        false,
        'hash-6',
        wire
      )
      const step = await service.insertStepState(
        runId,
        'retry-step',
        'myRpc',
        {},
        { retries: 2 }
      )

      await service.setStepError(step.stepId, new Error('fail'))
      const retried = await service.createRetryAttempt(step.stepId, 'pending')
      assert.equal(retried.status, 'pending')
      assert.equal(retried.attemptCount, 2)
      assert.equal(retried.error, undefined)
      assert.equal(retried.result, undefined)
    })

    test('getRunStatus reports per-step duration and attempts', async () => {
      const runId = await service.createRun(
        'status-timing-workflow',
        {},
        false,
        'hash-timing',
        wire
      )
      const step = await service.insertStepState(
        runId,
        'timed-step',
        'myRpc',
        {}
      )
      await service.setStepRunning(step.stepId)
      await service.setStepResult(step.stepId, { ok: true })

      const status = await service.getRunStatus(runId)
      assert.ok(status)
      const timed = status.steps.find((s) => s.name === 'timed-step')
      assert.ok(timed, 'step appears in run status')
      // running→succeeded must stamp runningAt/succeededAt so a duration is
      // computable. Regression guard: the kysely store previously updated
      // only the status on transitions, leaving the timestamps null and
      // duration permanently undefined.
      assert.ok(
        timed.duration !== undefined,
        'duration is computed from stamped transition timestamps'
      )
      assert.ok(timed.duration >= 0, 'duration is non-negative')
      assert.equal(timed.attempts, 1, 'single attempt')
    })

    test('getRunStatus surfaces retried attempt count', async () => {
      const runId = await service.createRun(
        'status-retry-workflow',
        {},
        false,
        'hash-retry-status',
        wire
      )
      const step = await service.insertStepState(
        runId,
        'flaky-step',
        'myRpc',
        {},
        { retries: 2 }
      )
      await service.setStepRunning(step.stepId)
      await service.setStepError(step.stepId, new Error('first try'))
      // Guarantee the retry's history row sorts after the failed attempt so
      // getRunStatus picks the latest attempt (it tie-breaks on timestamps).
      await new Promise((resolve) => setTimeout(resolve, 5))
      const retry = await service.createRetryAttempt(step.stepId, 'pending')
      await service.setStepRunning(retry.stepId)
      await service.setStepResult(retry.stepId, { ok: true })

      const status = await service.getRunStatus(runId)
      assert.ok(status)
      const flaky = status.steps.find((s) => s.name === 'flaky-step')
      assert.ok(flaky, 'retried step collapses to a single status entry')
      assert.equal(flaky.status, 'succeeded', 'latest attempt wins')
      assert.equal(flaky.attempts, 2, 'attempt count surfaces in status')
    })

    test('getNodeResults', async () => {
      const runId = await service.createRun(
        'results-workflow',
        {},
        false,
        'hash-8',
        wire
      )
      const step = await service.insertStepState(runId, 'node-a', 'rpc', {})
      await service.setStepResult(step.stepId, { out: 'hello' })

      const results = await service.getNodeResults(runId, ['node-a'])
      assert.deepEqual(results['node-a'], { out: 'hello' })
    })

    test('setBranchTaken and getCompletedGraphState', async () => {
      const runId = await service.createRun(
        'branch-workflow',
        {},
        false,
        'hash-9',
        wire
      )
      const step = await service.insertStepState(
        runId,
        'branch-node',
        'rpc',
        {}
      )
      await service.setStepResult(step.stepId, {})
      await service.setBranchTaken(step.stepId, 'left')

      const state = await service.getCompletedGraphState(runId)
      assert.ok(state.completedNodeIds.includes('branch-node'))
      assert.equal(state.branchKeys['branch-node'], 'left')
    })

    test('updateRunState and getRunState', async () => {
      const runId = await service.createRun(
        'state-workflow',
        {},
        false,
        'hash-10',
        wire
      )

      await service.updateRunState(runId, 'counter', 5)
      await service.updateRunState(runId, 'name', 'test')

      const state = await service.getRunState(runId)
      assert.equal(state.counter, 5)
      assert.equal(state.name, 'test')
    })

    test('upsertWorkflowVersion and getWorkflowVersion', async () => {
      await service.upsertWorkflowVersion(
        'my-workflow',
        'v1-hash',
        { nodes: ['a', 'b'] },
        'dsl'
      )

      const version = await service.getWorkflowVersion('my-workflow', 'v1-hash')
      assert.ok(version)
      assert.deepEqual(version.graph, { nodes: ['a', 'b'] })
      assert.equal(version.source, 'dsl')
    })

    test('upsertWorkflowVersion duplicate is no-op', async () => {
      await service.upsertWorkflowVersion(
        'my-workflow',
        'v1-hash',
        { nodes: ['changed'] },
        'dsl'
      )

      const version = await service.getWorkflowVersion('my-workflow', 'v1-hash')
      assert.ok(version)
      assert.deepEqual(version.graph, { nodes: ['a', 'b'] })
    })

    test('getWorkflowVersion returns null for missing', async () => {
      const version = await service.getWorkflowVersion('missing', 'missing')
      assert.equal(version, null)
    })
  })
}
