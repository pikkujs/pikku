import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'

let service: InMemoryWorkflowService

beforeEach(() => {
  service = new InMemoryWorkflowService()
})

describe('InMemoryWorkflowService', () => {
  describe('createRun', () => {
    test('should create a run and return a UUID', async () => {
      const runId = await service.createRun(
        'test-workflow',
        { key: 'val' },
        true,
        'hash1',
        { type: 'test' } as any
      )
      assert.ok(runId)
      assert.strictEqual(typeof runId, 'string')
    })

    test('should store the run with correct properties', async () => {
      const runId = await service.createRun(
        'my-workflow',
        { input: 1 },
        false,
        'hash2',
        { type: 'http' } as any
      )
      const run = await service.getRun(runId)
      assert.ok(run)
      assert.strictEqual(run.workflow, 'my-workflow')
      assert.strictEqual(run.status, 'running')
      assert.deepStrictEqual(run.input, { input: 1 })
      assert.strictEqual(run.inline, false)
      assert.strictEqual(run.graphHash, 'hash2')
    })

    test('should initialize empty step history and run state', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const history = await service.getRunHistory(runId)
      assert.deepStrictEqual(history, [])
      const state = await service.getRunState(runId)
      assert.deepStrictEqual(state, {})
    })
  })

  describe('getRun', () => {
    test('should return null for non-existent run', async () => {
      const run = await service.getRun('non-existent')
      assert.strictEqual(run, null)
    })
  })

  describe('updateRunStatus', () => {
    test('should update run status', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      await service.updateRunStatus(runId, 'succeeded', { result: 'done' })
      const run = await service.getRun(runId)
      assert.strictEqual(run!.status, 'succeeded')
      assert.deepStrictEqual(run!.output, { result: 'done' })
    })

    test('should update run with error', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const error = { name: 'Error', message: 'Failed' }
      await service.updateRunStatus(runId, 'failed', undefined, error)
      const run = await service.getRun(runId)
      assert.strictEqual(run!.status, 'failed')
      assert.deepStrictEqual(run!.error, error)
    })

    test('should handle non-existent run gracefully', async () => {
      await service.updateRunStatus('non-existent', 'failed')
      // Should not throw
    })
  })

  describe('step lifecycle', () => {
    test('should insert a step in pending state', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', 'rpcFunc', {
        data: 1,
      })
      assert.strictEqual(step.status, 'pending')
      assert.strictEqual(step.attemptCount, 1)
      assert.ok(step.stepId)
    })

    test('should store step options', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(
        runId,
        'step1',
        null,
        {},
        { retries: 3, retryDelay: 1000 }
      )
      assert.strictEqual(step.retries, 3)
      assert.strictEqual(step.retryDelay, 1000)
    })

    test('should transition step to running', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', null, {})
      await service.setStepRunning(step.stepId)
      const updated = await service.getStepState(runId, 'step1')
      assert.strictEqual(updated.status, 'running')
      assert.ok(updated.runningAt)
    })

    test('should transition step to scheduled', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', null, {})
      await service.setStepScheduled(step.stepId)
      const updated = await service.getStepState(runId, 'step1')
      assert.strictEqual(updated.status, 'scheduled')
      assert.ok(updated.scheduledAt)
    })

    test('should transition step to succeeded with result', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', null, {})
      await service.setStepResult(step.stepId, { output: 'done' })
      const updated = await service.getStepState(runId, 'step1')
      assert.strictEqual(updated.status, 'succeeded')
      assert.deepStrictEqual(updated.result, { output: 'done' })
      assert.ok(updated.succeededAt)
    })

    test('should transition step to failed with error', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', null, {})
      const error = new Error('step failed')
      await service.setStepError(step.stepId, error)
      const updated = await service.getStepState(runId, 'step1')
      assert.strictEqual(updated.status, 'failed')
      assert.strictEqual(updated.error!.message, 'step failed')
      assert.ok(updated.failedAt)
    })

    test('should return default step state for non-existent step', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.getStepState(runId, 'non-existent')
      assert.strictEqual(step.stepId, '')
      assert.strictEqual(step.status, 'pending')
      assert.strictEqual(step.attemptCount, 0)
    })
  })

  describe('retry attempts', () => {
    test('should create a retry attempt with incremented count', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(
        runId,
        'step1',
        'rpc',
        {},
        { retries: 2 }
      )
      await service.setStepError(step.stepId, new Error('fail'))
      const retry = await service.createRetryAttempt(step.stepId, 'pending')
      assert.strictEqual(retry.attemptCount, 2)
      assert.strictEqual(retry.status, 'pending')
    })

    test('should set running status on retry if specified', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', null, {})
      await service.setStepError(step.stepId, new Error('fail'))
      const retry = await service.createRetryAttempt(step.stepId, 'running')
      assert.strictEqual(retry.status, 'running')
      assert.ok(retry.runningAt)
    })

    test('should throw for non-existent step retry', async () => {
      await assert.rejects(
        () => service.createRetryAttempt('non-existent', 'pending'),
        { message: 'Step not found: non-existent' }
      )
    })

    test('should add retry to history', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'step1', null, {})
      await service.setStepError(step.stepId, new Error('fail'))
      await service.createRetryAttempt(step.stepId, 'pending')
      const history = await service.getRunHistory(runId)
      assert.strictEqual(history.length, 2)
    })
  })

  describe('run state', () => {
    test('should update and get run state', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      await service.updateRunState(runId, 'counter', 5)
      await service.updateRunState(runId, 'status', 'active')
      const state = await service.getRunState(runId)
      assert.deepStrictEqual(state, { counter: 5, status: 'active' })
    })

    test('should return empty object for non-existent run state', async () => {
      const state = await service.getRunState('non-existent')
      assert.deepStrictEqual(state, {})
    })
  })

  describe('graph state', () => {
    test('should track completed and failed nodes', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step1 = await service.insertStepState(runId, 'node1', null, {})
      await service.setStepResult(step1.stepId, 'ok')
      const step2 = await service.insertStepState(
        runId,
        'node2',
        null,
        {},
        { retries: 0 }
      )
      await service.setStepError(step2.stepId, new Error('fail'))

      const state = await service.getCompletedGraphState(runId)
      assert.deepStrictEqual(state.completedNodeIds, ['node1'])
      assert.deepStrictEqual(state.failedNodeIds, ['node2'])
    })

    test('should not count failed step as terminal if retries remain', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(
        runId,
        'node1',
        null,
        {},
        { retries: 2 }
      )
      await service.setStepError(step.stepId, new Error('fail'))

      const state = await service.getCompletedGraphState(runId)
      assert.deepStrictEqual(state.failedNodeIds, [])
    })

    test('should find nodes without steps', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      await service.insertStepState(runId, 'node1', null, {})

      const missing = await service.getNodesWithoutSteps(runId, [
        'node1',
        'node2',
        'node3',
      ])
      assert.deepStrictEqual(missing, ['node2', 'node3'])
    })

    test('should get node results', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step1 = await service.insertStepState(runId, 'node1', null, {})
      await service.setStepResult(step1.stepId, { value: 42 })
      await service.insertStepState(runId, 'node2', null, {})

      const results = await service.getNodeResults(runId, ['node1', 'node2'])
      assert.deepStrictEqual(results, { node1: { value: 42 } })
    })
  })

  describe('branch keys', () => {
    test('should set and track branch keys', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'branch-node', null, {})
      await service.setBranchKey(runId, 'branch-node', 'left')

      const state = await service.getCompletedGraphState(runId)
      assert.strictEqual(state.branchKeys['branch-node'], 'left')
    })

    test('should set branch taken by stepId', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      const step = await service.insertStepState(runId, 'node1', null, {})
      await service.setBranchTaken(step.stepId, 'right')

      const state = await service.getCompletedGraphState(runId)
      assert.strictEqual(state.branchKeys['node1'], 'right')
    })
  })

  describe('workflow versions', () => {
    test('should upsert and get workflow version', async () => {
      const graph = { nodes: ['a', 'b'] }
      await service.upsertWorkflowVersion('myWf', 'hash1', graph, 'source-code')

      const version = await service.getWorkflowVersion('myWf', 'hash1')
      assert.deepStrictEqual(version, { graph, source: 'source-code' })
    })

    test('should return null for non-existent version', async () => {
      const version = await service.getWorkflowVersion('unknown', 'unknown')
      assert.strictEqual(version, null)
    })
  })

  describe('locking', () => {
    test('withRunLock should execute function directly', async () => {
      const result = await service.withRunLock('run1', async () => 'result')
      assert.strictEqual(result, 'result')
    })

    test('withStepLock should execute function directly', async () => {
      const result = await service.withStepLock('run1', 'step1', async () => 42)
      assert.strictEqual(result, 42)
    })
  })

  describe('close', () => {
    test('should clear all internal state', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      await service.insertStepState(runId, 'step1', null, {})
      await service.updateRunState(runId, 'key', 'val')
      await service.upsertWorkflowVersion('wf', 'h', {}, 'src')

      await service.close()

      assert.strictEqual(await service.getRun(runId), null)
      const history = await service.getRunHistory(runId)
      assert.deepStrictEqual(history, [])
      const state = await service.getRunState(runId)
      assert.deepStrictEqual(state, {})
      const version = await service.getWorkflowVersion('wf', 'h')
      assert.strictEqual(version, null)
    })
  })

  describe('run history', () => {
    test('should track step insertions in history', async () => {
      const runId = await service.createRun('wf', {}, true, 'h', {} as any)
      await service.insertStepState(runId, 'step1', null, {})
      await service.insertStepState(runId, 'step2', null, {})

      const history = await service.getRunHistory(runId)
      assert.strictEqual(history.length, 2)
      assert.strictEqual(history[0].stepName, 'step1')
      assert.strictEqual(history[1].stepName, 'step2')
    })

    test('should return empty array for non-existent run', async () => {
      const history = await service.getRunHistory('non-existent')
      assert.deepStrictEqual(history, [])
    })
  })
})
