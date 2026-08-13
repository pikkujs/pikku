import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { runWorkflowGraph } from './graph/graph-runner.js'
import { assertWorkflowRunOwner } from './workflow-run-ownership.js'
import { WorkflowStepFunctionMismatchError } from './workflow-errors.js'
import { ForbiddenError } from '../../errors/errors.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

const seedSingletons = () =>
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
    // `resumeWorkflow` hands the run back to the orchestrator queue; the tests
    // here assert on what happened before that hand-off.
    queueService: { add: async () => 'job-1' },
  } as any)

describe('a graph run starts at an entry node the graph declared', () => {
  const meta = {
    name: 'payout',
    pikkuFuncId: 'payout',
    source: 'graph' as const,
    entryNodeIds: ['validate'],
    graphHash: 'payout-hash',
    nodes: {
      validate: { nodeId: 'validate', rpcName: 'validatePayout' },
      // Reachable only after validation, but its input is a literal — so
      // `areDependenciesSatisfied` alone would happily start the run here.
      transfer: {
        nodeId: 'transfer',
        rpcName: 'transferFunds',
        input: { amount: 1000 },
      },
    },
  }

  test('a startNode outside entryNodeIds is rejected', async () => {
    seedSingletons()
    const ws = new InMemoryWorkflowService()

    await assert.rejects(
      runWorkflowGraph(
        ws,
        'payout',
        {},
        { rpcWithWire: async () => ({}) },
        true,
        'transfer',
        undefined,
        meta
      ),
      /'transfer' is not an entry node/
    )
  })

  test('a declared entry node still starts the run', async () => {
    seedSingletons()
    const ws = new InMemoryWorkflowService()

    const { runId } = await runWorkflowGraph(
      ws,
      'payout',
      {},
      { rpcWithWire: async () => ({}) },
      true,
      'validate',
      undefined,
      meta
    )

    assert.ok(runId, 'the graph ran from the entry node it declared')
  })
})

describe('a step runs the function the workflow dispatched it with', () => {
  test('a queue message naming another function is rejected', async () => {
    seedSingletons()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'queue',
    })
    await ws.insertStepState(runId, 'notify', 'sendReceipt', {})

    const invoked: string[] = []
    await assert.rejects(
      ws.executeWorkflowStep(runId, 'notify', 'deleteAllUsers', {}, {
        rpcWithWire: async (rpcName: string) => {
          invoked.push(rpcName)
          return {}
        },
      } as any),
      WorkflowStepFunctionMismatchError
    )
    assert.deepEqual(invoked, [], 'nothing was invoked')

    const stepState = await ws.getStepState(runId, 'notify')
    assert.equal(
      stepState.status,
      'pending',
      'the forged message left the step untouched'
    )
  })

  test('the dispatched function still runs', async () => {
    seedSingletons()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'queue',
    })
    await ws.insertStepState(runId, 'notify', 'sendReceipt', {})

    const invoked: string[] = []
    await ws.executeWorkflowStep(runId, 'notify', 'sendReceipt', {}, {
      rpcWithWire: async (rpcName: string) => {
        invoked.push(rpcName)
        return {}
      },
    } as any)

    assert.deepEqual(invoked, ['sendReceipt'])
  })
})

describe('workflow run ownership', () => {
  test('a run started by a session is readable only by that session', () => {
    assert.throws(
      () =>
        assertWorkflowRunOwner(
          { type: 'http', pikkuUserId: 'user-a' },
          {
            userId: 'user-b',
          }
        ),
      ForbiddenError
    )
    assert.throws(
      () =>
        assertWorkflowRunOwner(
          { type: 'http', pikkuUserId: 'user-a' },
          undefined
        ),
      ForbiddenError
    )
    assert.doesNotThrow(() =>
      assertWorkflowRunOwner(
        { type: 'http', pikkuUserId: 'user-a' },
        {
          userId: 'user-a',
        }
      )
    )
  })

  test('a run with no recorded owner has no ownership to enforce', () => {
    assert.doesNotThrow(() =>
      assertWorkflowRunOwner({ type: 'trigger' }, { userId: 'user-b' })
    )
  })

  test('approveStep does not impose ownership on a gate that did not ask for it', async () => {
    seedSingletons()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'http',
      pikkuUserId: 'owner',
    })

    await ws.approveStep(
      runId,
      'release-funds',
      { ok: true },
      {
        userId: 'not-the-owner',
      }
    )

    const state = await ws.getRunState(runId)
    assert.equal(
      Object.keys(state).length,
      1,
      'the decision was recorded, to be judged against the gate on replay'
    )
  })

  test('approveStep accepts the run owner', async () => {
    seedSingletons()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'http',
      pikkuUserId: 'owner',
    })

    await ws.approveStep(
      runId,
      'release-funds',
      { ok: true },
      {
        userId: 'owner',
      }
    )

    const state = await ws.getRunState(runId)
    assert.equal(
      Object.keys(state).length,
      1,
      'the owner’s decision was recorded'
    )
  })
})
