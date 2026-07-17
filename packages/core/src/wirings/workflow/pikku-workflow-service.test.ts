import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { StandardSchemaV1 } from '@standard-schema/spec'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import {
  WorkflowApprovalResolvedError,
  WorkflowSuspendedException,
  type PikkuWorkflowWire,
} from './pikku-workflow-service.js'

describe('pikku-workflow-service worker registration', () => {
  test('registers sleeper function metadata after wireQueueWorkers', () => {
    resetPikkuState()

    const ws = new InMemoryWorkflowService()
    ws.wireQueueWorkers()

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
  // execution (workflowQueued: true).
  class TestWorkflowService extends InMemoryWorkflowService {
    public callDispatchStep(rpcName: string) {
      return this.dispatchStep('run-1', 'step-1', rpcName, {})
    }
  }

  const setupFunction = (rpcName: string, workflowQueued?: boolean) => {
    pikkuState(null, 'rpc', 'meta')[rpcName] = rpcName as any
    pikkuState(null, 'function', 'meta')[rpcName] = {
      pikkuFuncId: rpcName,
      sessionless: true,
      ...(workflowQueued === undefined ? {} : { workflowQueued }),
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

  test('workflowQueued: true step IS dispatched to the queue when a queueService exists', async () => {
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

    setupFunction('queuedStep', true)
    const dispatched = await ws.callDispatchStep('queuedStep')
    assert.equal(dispatched, true, 'workflowQueued step should dispatch')
    assert.equal(queued, true, 'workflowQueued step should queue')
    cleanup('queuedStep')
  })

  test('workflowQueued: true step throws when no queueService is configured', async () => {
    const ws = new TestWorkflowService()
    pikkuState(null, 'package', 'singletonServices', {
      logger: { error() {}, info() {}, warn() {}, debug() {} },
      // no queueService
    } as any)

    setupFunction('queuedStepNoQueue', true)
    await assert.rejects(
      () => ws.callDispatchStep('queuedStepNoQueue'),
      /workflowQueued: true.*no queue service/i
    )
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

/**
 * A minimal StandardSchemaV1 — the same interface zod/valibot/arktype expose via
 * `~standard`. Hand-rolled here because @pikku/core deliberately has no zod
 * dependency: schemas reach it through the standard-schema spec only.
 */
const approvalDecisionSchema: StandardSchemaV1<
  { approved: boolean; comment?: string },
  { approved: boolean; comment?: string }
> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        return { issues: [{ message: 'expected an object' }] }
      }
      const { approved, comment } = value as Record<string, unknown>
      if (typeof approved !== 'boolean') {
        return {
          issues: [
            { message: 'approved must be a boolean', path: ['approved'] },
          ],
        }
      }
      if (comment !== undefined && typeof comment !== 'string') {
        return {
          issues: [{ message: 'comment must be a string', path: ['comment'] }],
        }
      }
      return { value: { approved, ...(comment ? { comment } : {}) } }
    },
  },
}

const registerApprovalWorkflow = (
  workflowName: string,
  graphHash: string,
  func: (
    services: any,
    data: any,
    wire: { workflow: PikkuWorkflowWire }
  ) => Promise<any>
) => {
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
    graphHash,
  }
  const functionMetaState = pikkuState(null, 'function', 'meta')
  functionMetaState[workflowName] = {
    name: workflowName,
    sessionless: true,
    permissions: [],
  } as any

  addWorkflow(workflowName, { func })

  return () => {
    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  }
}

describe('pikku-workflow-service approval', () => {
  test('resuming without a decision must NOT fall through the approval', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testApprovalNoFallthrough'
    const graphHash = 'approval-no-fallthrough'
    let bodyRuns = 0

    const cleanup = registerApprovalWorkflow(
      workflowName,
      graphHash,
      async (_services, _data, { workflow }) => {
        bodyRuns++
        const decision = await workflow.approval('Approve invoice', {
          schema: approvalDecisionSchema,
        })
        return { decision }
      }
    )

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })

    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )
    assert.equal((await ws.getRun(runId))?.status, 'suspended')

    // THE point of an approval vs a suspend: a bare resume with no decision
    // recorded must re-suspend, not walk past the gate.
    await ws.resumeWorkflow(runId)
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )
    assert.equal((await ws.getRun(runId))?.status, 'suspended')
    assert.equal(bodyRuns, 2)

    cleanup()
  })

  test('approveStep records a decision the workflow then returns', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testApprovalDecision'
    const graphHash = 'approval-decision'

    const cleanup = registerApprovalWorkflow(
      workflowName,
      graphHash,
      async (_services, _data, { workflow }) => {
        const decision = await workflow.approval('Approve invoice', {
          schema: approvalDecisionSchema,
        })
        return { decision }
      }
    )

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )

    await ws.approveStep(runId, 'Approve invoice', {
      approved: true,
      comment: 'lgtm',
    })
    await ws.runWorkflowJob(runId, {})

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')
    assert.deepEqual(run?.output, {
      decision: {
        status: 'decided',
        data: { approved: true, comment: 'lgtm' },
      },
    })

    cleanup()
  })

  test('approveStep rejects a payload that fails the schema', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testApprovalSchema'
    const graphHash = 'approval-schema'

    const cleanup = registerApprovalWorkflow(
      workflowName,
      graphHash,
      async (_services, _data, { workflow }) => {
        const decision = await workflow.approval('Approve invoice', {
          schema: approvalDecisionSchema,
        })
        return { decision }
      }
    )

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )

    // The resume payload crosses an HTTP boundary from an untrusted caller.
    // approveStep only records it; validation happens on replay, inside the
    // workflow body, which is the only place the schema value is in scope.
    await ws.approveStep(runId, 'Approve invoice', { approved: 'yes-please' })

    // An invalid decision must leave the gate closed rather than fail the run.
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )
    assert.equal((await ws.getRun(runId))?.status, 'suspended')

    // ...and the rejection is legible to whoever tries to approve next.
    const state = await ws.getRunState(runId)
    assert.match(
      JSON.stringify(state),
      /approved/,
      'expected the validation failure to be recorded in run state'
    )

    // A subsequent valid decision still lands.
    await ws.approveStep(runId, 'Approve invoice', { approved: false })
    await ws.runWorkflowJob(runId, {})
    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')
    assert.deepEqual(run?.output, {
      decision: { status: 'decided', data: { approved: false } },
    })

    cleanup()
  })

  test('an expired approval returns { status: expired } instead of hanging', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testApprovalExpiry'
    const graphHash = 'approval-expiry'

    const cleanup = registerApprovalWorkflow(
      workflowName,
      graphHash,
      async (_services, _data, { workflow }) => {
        const decision = await workflow.approval('Approve invoice', {
          schema: approvalDecisionSchema,
          expiry: '10ms',
        })
        return { decision }
      }
    )

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )

    await new Promise((resolve) => setTimeout(resolve, 25))

    await ws.resumeWorkflow(runId)
    await ws.runWorkflowJob(runId, {})

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')
    assert.deepEqual(run?.output, { decision: { status: 'expired' } })

    cleanup()
  })

  test('a decision arriving after the gate resolved is rejected, not dropped', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testApprovalAfterResolved'
    const graphHash = 'approval-after-resolved'

    const cleanup = registerApprovalWorkflow(
      workflowName,
      graphHash,
      async (_services, _data, { workflow }) => {
        const decision = await workflow.approval('Approve invoice', {
          schema: approvalDecisionSchema,
          expiry: '10ms',
        })
        return { decision }
      }
    )

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )

    // Let the gate expire and resolve.
    await new Promise((resolve) => setTimeout(resolve, 25))
    await ws.resumeWorkflow(runId)
    await ws.runWorkflowJob(runId, {})
    assert.equal((await ws.getRun(runId))?.status, 'completed')

    // The gate caches its outcome and never re-reads state, so accepting this
    // would discard it silently. The approver must be told it did not land.
    await assert.rejects(
      ws.approveStep(runId, 'Approve invoice', { approved: true }),
      (error: unknown) =>
        error instanceof WorkflowApprovalResolvedError &&
        error.payload.outcome === 'expired'
    )

    // The resolved outcome stands.
    const run = await ws.getRun(runId)
    assert.deepEqual(run?.output, { decision: { status: 'expired' } })

    cleanup()
  })

  test('a decision that landed before expiry wins over the expiry', async () => {
    const ws = new InMemoryWorkflowService()
    const workflowName = 'testApprovalExpiryRace'
    const graphHash = 'approval-expiry-race'

    const cleanup = registerApprovalWorkflow(
      workflowName,
      graphHash,
      async (_services, _data, { workflow }) => {
        const decision = await workflow.approval('Approve invoice', {
          schema: approvalDecisionSchema,
          expiry: '10ms',
        })
        return { decision }
      }
    )

    const runId = await ws.createRun(workflowName, {}, false, graphHash, {
      type: 'test',
    })
    await assert.rejects(
      ws.runWorkflowJob(runId, {}),
      (error: unknown) => error instanceof WorkflowSuspendedException
    )

    await ws.approveStep(runId, 'Approve invoice', { approved: true })

    // Expiry fires unconditionally (an enqueued durable timer can't be
    // retracted), so it must no-op once a decision has landed.
    await new Promise((resolve) => setTimeout(resolve, 25))
    await ws.resumeWorkflow(runId)
    await ws.runWorkflowJob(runId, {})

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')
    assert.deepEqual(run?.output, {
      decision: { status: 'decided', data: { approved: true } },
    })

    cleanup()
  })
})
