import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import {
  WorkflowSuspendedException,
  type PikkuWorkflowWire,
} from './pikku-workflow-service.js'

describe('pikku-workflow-service inline meta flag', () => {
  test('workflow with inline: true in meta should create inline run and not queue', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testInlineMetaFlag'
    const graphHash = 'inline-meta-hash'

    // Set up a queue service that tracks if anything was queued
    let queued = false
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
        debug: () => {},
      },
      queueService: {
        add: async () => {
          queued = true
        },
      },
    } as any)

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState[workflowName] = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'dsl',
      graphHash,
      inline: true,
    }

    const functionMetaState = pikkuState(null, 'function', 'meta')
    functionMetaState[workflowName] = {
      name: workflowName,
      sessionless: true,
      permissions: [],
    } as any

    addWorkflow(workflowName, {
      func: async () => {
        return { ok: true }
      },
    })

    const { runId } = await ws.startWorkflow(workflowName, {}, {})

    // The run should be created as inline
    const run = await ws.getRun(runId)
    assert.equal(run?.inline, true, 'run should be marked as inline')
    assert.equal(
      queued,
      false,
      'nothing should have been queued to the queue service'
    )

    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  })

  test('workflow without inline flag should use queue when queueService exists', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testNonInlineMetaFlag'
    const graphHash = 'non-inline-meta-hash'

    let queued = false
    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {
          queued = true
        },
      },
    } as any)

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState[workflowName] = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'dsl',
      graphHash,
      // no inline flag
    }

    const functionMetaState = pikkuState(null, 'function', 'meta')
    functionMetaState[workflowName] = {
      name: workflowName,
      sessionless: true,
      permissions: [],
    } as any

    addWorkflow(workflowName, {
      func: async () => {
        return { ok: true }
      },
    })

    await ws.startWorkflow(workflowName, {}, {})

    // Wait a tick
    await new Promise((r) => setTimeout(r, 50))

    assert.equal(queued, true, 'workflow should have been queued')

    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  })
})

describe('pikku-workflow-service version mismatch fallback', () => {
  test('should fall back to stored graph for dsl workflow version mismatch', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testDslVersionMismatch'
    const oldHash = 'old-hash'
    const newHash = 'new-hash'

    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {},
      },
    } as any)

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState[workflowName] = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'dsl',
      graphHash: newHash,
    }

    await ws.upsertWorkflowVersion(
      workflowName,
      oldHash,
      {
        name: workflowName,
        pikkuFuncId: workflowName,
        source: 'dsl',
        graphHash: oldHash,
        nodes: {
          nodeA: { nodeId: 'nodeA', rpcName: 'doA' },
        },
        entryNodeIds: ['nodeA'],
      },
      'dsl'
    )
    const runId = await ws.createRun(workflowName, {}, false, oldHash, {
      type: 'test',
    })

    await ws.runWorkflowJob(runId, {})

    const step = await ws.getStepState(runId, 'nodeA')
    const run = await ws.getRun(runId)
    assert.notEqual(step.stepId, '')
    assert.equal(step.status, 'pending')
    assert.equal(run?.status, 'running')

    delete metaState[workflowName]
  })

  test('should continue from stored graph version when hashes mismatch', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testGraphVersionMismatch'
    const oldHash = 'old-graph-hash'
    const newHash = 'new-graph-hash'

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState[workflowName] = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'graph',
      graphHash: newHash,
      nodes: {
        changedNode: { nodeId: 'changedNode', rpcName: 'changedRpc' },
      },
      entryNodeIds: ['changedNode'],
    }

    await ws.upsertWorkflowVersion(
      workflowName,
      oldHash,
      {
        name: workflowName,
        pikkuFuncId: workflowName,
        source: 'graph',
        graphHash: oldHash,
        nodes: {},
        entryNodeIds: [],
      },
      'graph'
    )

    const runId = await ws.createRun(workflowName, {}, false, oldHash, {
      type: 'test',
    })
    await ws.runWorkflowJob(runId, {})

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')

    delete metaState[workflowName]
  })
})

describe('pikku-workflow-service executeWorkflowStep', () => {
  test('should set pending step to running before succeeding', async () => {
    const ws = new InMemoryWorkflowService()
    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {},
      },
    } as any)

    const runId = await ws.createRun(
      'pending-step-running',
      {},
      false,
      'hash',
      { type: 'test' }
    )
    await ws.insertStepState(runId, 'stepA', 'doStepA', { a: 1 })

    await ws.executeWorkflowStep(
      runId,
      'stepA',
      'doStepA',
      { a: 1 },
      {
        rpcWithWire: async () => ({ ok: true }),
      }
    )

    const step = await ws.getStepState(runId, 'stepA')
    assert.equal(step.status, 'succeeded')
    assert.ok(step.runningAt instanceof Date)
  })
})

describe('pikku-workflow-service suspend', () => {
  test('should set run status to suspended when workflow.suspend is called', async () => {
    const ws = new InMemoryWorkflowService()
    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {},
      },
    } as any)

    const workflowName = 'testSuspendWorkflow'
    const graphHash = 'suspend-hash'
    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState[workflowName] = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'dsl',
      graphHash,
    }
    const functionMetaState = pikkuState(null, 'function', 'meta')
    functionMetaState[workflowName] = {
      name: workflowName,
      sessionless: true,
      permissions: [],
    } as any

    addWorkflow(workflowName, {
      func: async (
        _services: any,
        _data: any,
        { workflow }: { workflow: PikkuWorkflowWire }
      ) => {
        await workflow.suspend('Needs approval')
        return { ok: true }
      },
    })

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'suspended')
    assert.equal(run?.error?.code, 'WORKFLOW_SUSPENDED')
    assert.equal(run?.error?.message, 'Needs approval')

    await ws.resumeWorkflow(runId)
    await ws.runWorkflowJob(runId, {})
    const resumedRun = await ws.getRun(runId)
    assert.equal(resumedRun?.status, 'completed')
    assert.deepEqual(resumedRun?.output, { ok: true })

    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  })
})
