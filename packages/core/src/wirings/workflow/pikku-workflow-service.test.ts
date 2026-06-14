import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import {
  WorkflowSuspendedException,
  type PikkuWorkflowWire,
} from './pikku-workflow-service.js'

describe('pikku-workflow-service worker registration', () => {
  test('registers sleeper function metadata', () => {
    resetPikkuState()

    new InMemoryWorkflowService()

    const functionMeta = pikkuState(null, 'function', 'meta')
    assert.deepEqual(functionMeta.pikkuWorkflowSleeper, {
      pikkuFuncId: 'pikkuWorkflowSleeper',
      sessionless: true,
      functionType: 'helper',
      inputSchemaName: null,
      outputSchemaName: null,
    })
  })
})

describe('pikku-workflow-service run-level inline', () => {
  test('workflow runs inline (and queues nothing) when no queue service is configured', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testRunInlineNoQueue'
    const graphHash = 'run-inline-no-queue-hash'

    // No queueService configured at all → the run executes inline.
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        error: () => {},
        info: () => {},
        warn: () => {},
        debug: () => {},
      },
    } as any)

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
      func: async () => {
        return { ok: true }
      },
    })

    const { runId } = await ws.startWorkflow(workflowName, {}, {}, {})

    // With no queue service the run is created as inline.
    const run = await ws.getRun(runId)
    assert.equal(run?.inline, true, 'run should be marked as inline')

    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  })

  test('workflow is dispatched to the queue when a queueService exists', async () => {
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

describe('pikku-workflow-service per-function step dispatch', () => {
  // Expose the protected dispatchStep so we can assert the dispatch decision
  // in isolation: a step queues only when its function opts out of inline
  // execution (inline: false).
  class TestWorkflowService extends InMemoryWorkflowService {
    public callDispatchStep(rpcName: string) {
      return this.dispatchStep('run-1', 'step-1', rpcName, {})
    }
  }

  const setupFunction = (rpcName: string, inline?: boolean) => {
    pikkuState(null, 'rpc', 'meta')[rpcName] = rpcName as any
    pikkuState(null, 'function', 'meta')[rpcName] = {
      pikkuFuncId: rpcName,
      sessionless: true,
      ...(inline === undefined ? {} : { inline }),
    } as any
  }

  const cleanup = (rpcName: string) => {
    delete pikkuState(null, 'rpc', 'meta')[rpcName]
    delete pikkuState(null, 'function', 'meta')[rpcName]
  }

  test('default (inline) step is NOT dispatched to the queue', async () => {
    const ws = new TestWorkflowService()
    let queued = false
    pikkuState(null, 'package', 'singletonServices', {
      logger: { error() {}, info() {}, warn() {}, debug() {} },
      queueService: {
        add: async () => {
          queued = true
        },
      },
    } as any)

    setupFunction('defaultInlineStep')
    const dispatched = await ws.callDispatchStep('defaultInlineStep')
    assert.equal(dispatched, false, 'default step should run inline')
    assert.equal(queued, false, 'default step should not queue')
    cleanup('defaultInlineStep')
  })

  test('inline: false step IS dispatched to the queue when a queueService exists', async () => {
    const ws = new TestWorkflowService()
    let queued = false
    pikkuState(null, 'package', 'singletonServices', {
      logger: { error() {}, info() {}, warn() {}, debug() {} },
      queueService: {
        add: async () => {
          queued = true
        },
      },
    } as any)

    setupFunction('queuedStep', false)
    const dispatched = await ws.callDispatchStep('queuedStep')
    assert.equal(dispatched, true, 'inline:false step should dispatch')
    assert.equal(queued, true, 'inline:false step should queue')
    cleanup('queuedStep')
  })

  test('inline: false step warns and runs inline when no queueService is configured', async () => {
    const ws = new TestWorkflowService()
    let warned = false
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        error() {},
        info() {},
        warn: () => {
          warned = true
        },
        debug() {},
      },
      // no queueService
    } as any)

    setupFunction('queuedStepNoQueue', false)
    const dispatched = await ws.callDispatchStep('queuedStepNoQueue')
    assert.equal(
      dispatched,
      false,
      'falls back to inline when no queue service'
    )
    assert.equal(warned, true, 'should warn about the misconfiguration')
    cleanup('queuedStepNoQueue')
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

  test('should support multiple independent suspend points in one workflow', async () => {
    const ws = new InMemoryWorkflowService()
    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {},
      },
    } as any)

    const workflowName = 'testMultiSuspendWorkflow'
    const graphHash = 'multi-suspend-hash'
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
        await workflow.suspend('Building')
        await workflow.suspend('Awaiting approval')
        return { ok: true }
      },
    })

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })

    // First suspend: 'await_build' pauses the run.
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )
    let run = await ws.getRun(runId)
    assert.equal(run?.status, 'suspended')
    assert.equal(run?.error?.message, 'Building')

    // Resuming must hit the SECOND suspend ('awaiting_approval'), not fall
    // through it — this is what the shared-step-name bug broke.
    await ws.resumeWorkflow(runId)
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )
    run = await ws.getRun(runId)
    assert.equal(run?.status, 'suspended')
    assert.equal(run?.error?.message, 'Awaiting approval')

    // Resuming again completes the workflow.
    await ws.resumeWorkflow(runId)
    await ws.runWorkflowJob(runId, {})
    run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')
    assert.deepEqual(run?.output, { ok: true })

    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  })
})
