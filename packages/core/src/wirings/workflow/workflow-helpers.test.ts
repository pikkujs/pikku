import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  workflow,
  workflowStart,
  workflowStatus,
  graphStart,
} from './workflow-helpers.js'

describe('workflow helpers', () => {
  describe('workflow', () => {
    test('should return an object with func', () => {
      const wf = workflow('myWorkflow')
      assert.strictEqual(typeof wf.func, 'function')
    })

    test('func should call workflowService.runToCompletion', async () => {
      const wf = workflow('myWorkflow', { pollIntervalMs: 500 })
      let calledWith: any
      const services = {
        workflowService: {
          runToCompletion: async (...args: any[]) => {
            calledWith = args
            return { result: 'done' }
          },
        },
      }
      const result = await wf.func(services, { input: 1 }, { rpc: {} })
      assert.strictEqual(calledWith[0], 'myWorkflow')
      assert.deepStrictEqual(calledWith[1], { input: 1 })
      assert.deepStrictEqual(result, { result: 'done' })
    })
  })

  describe('workflowStart', () => {
    test('should return an object with func', () => {
      const wfs = workflowStart('myWorkflow')
      assert.strictEqual(typeof wfs.func, 'function')
    })

    test('func should call rpc.startWorkflow', async () => {
      const wfs = workflowStart('myWorkflow')
      let calledWith: any
      const rpc = {
        startWorkflow: async (...args: any[]) => {
          calledWith = args
          return { runId: 'run-1' }
        },
      }
      const result = await wfs.func({}, { input: 1 }, { rpc })
      assert.strictEqual(calledWith[0], 'myWorkflow')
      assert.deepStrictEqual(calledWith[1], { input: 1 })
      assert.deepStrictEqual(result, { runId: 'run-1' })
    })
  })

  describe('workflowStatus', () => {
    test('should return an object with func', () => {
      const wfst = workflowStatus('myWorkflow')
      assert.strictEqual(typeof wfst.func, 'function')
    })

    test('func should return run status', async () => {
      const wfst = workflowStatus('myWorkflow')
      const services = {
        workflowService: {
          getRun: async (runId: string) => ({
            id: runId,
            status: 'completed',
            output: { data: 'ok' },
          }),
        },
      }
      const result = await wfst.func(services, { runId: 'run-1' })
      assert.strictEqual(result.id, 'run-1')
      assert.strictEqual(result.status, 'completed')
      assert.deepStrictEqual(result.output, { data: 'ok' })
    })

    test('func should throw WorkflowRunNotFoundError for missing run', async () => {
      const wfst = workflowStatus('myWorkflow')
      const services = {
        workflowService: { getRun: async () => null },
      }
      await assert.rejects(
        () => wfst.func(services, { runId: 'non-existent' }),
        (err: any) => err.message.includes('non-existent')
      )
    })

    test('func should include error message when run has error', async () => {
      const wfst = workflowStatus('myWorkflow')
      const services = {
        workflowService: {
          getRun: async () => ({
            id: 'run-2',
            status: 'failed',
            error: { message: 'step failed', name: 'Error' },
          }),
        },
      }
      const result = await wfst.func(services, { runId: 'run-2' })
      assert.strictEqual(result.status, 'failed')
      assert.deepStrictEqual(result.error, { message: 'step failed' })
    })
  })

  describe('graphStart', () => {
    test('should return an object with func', () => {
      const gs = graphStart('myGraph', 'startNode')
      assert.strictEqual(typeof gs.func, 'function')
    })

    test('func should call rpc.startWorkflow with startNode', async () => {
      const gs = graphStart('myGraph', 'nodeA')
      let calledWith: any
      const rpc = {
        startWorkflow: async (...args: any[]) => {
          calledWith = args
          return { runId: 'run-3' }
        },
      }
      const result = await gs.func({}, { input: 1 }, { rpc })
      assert.strictEqual(calledWith[0], 'myGraph')
      assert.deepStrictEqual(calledWith[2], { startNode: 'nodeA' })
      assert.deepStrictEqual(result, { runId: 'run-3' })
    })
  })
})
