import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  pikkuWorkflowWorkerFunc,
  pikkuWorkflowOrchestratorFunc,
  pikkuWorkflowSleeperFunc,
} from './workflow-queue-workers.js'

beforeEach(() => {
  resetPikkuState()
})

describe('workflow-queue-workers', () => {
  test('worker calls executeWorkflowStep on the workflow service', async () => {
    const calls: unknown[][] = []
    const rpc = { rpcWithWire: async () => ({ ok: true }) }

    pikkuState(null, 'package', 'singletonServices', {
      workflowService: {
        executeWorkflowStep: async (...args: unknown[]) => {
          calls.push(args)
        },
      },
    } as never)

    await pikkuWorkflowWorkerFunc(
      {},
      {
        runId: 'run-1',
        stepName: 'step-a',
        rpcName: 'rpc.doThing',
        data: { ok: true },
      },
      { rpc: rpc as never }
    )

    assert.deepEqual(calls, [
      ['run-1', 'step-a', 'rpc.doThing', { ok: true }, rpc],
    ])
  })

  test('worker throws when workflow service is missing', async () => {
    pikkuState(null, 'package', 'singletonServices', {} as never)

    await assert.rejects(
      () =>
        pikkuWorkflowWorkerFunc(
          {},
          {
            runId: 'run-1',
            stepName: 'step-a',
            rpcName: 'rpc.doThing',
            data: {},
          },
          { rpc: {} as never }
        ),
      {
        message:
          'Workflow service not initialized: cannot execute workflow step for runId run-1, stepName step-a',
      }
    )
  })

  test('orchestrator calls orchestrateWorkflow on the workflow service', async () => {
    const calls: unknown[][] = []
    const rpc = { rpcWithWire: async () => ({ ok: true }) }

    pikkuState(null, 'package', 'singletonServices', {
      workflowService: {
        orchestrateWorkflow: async (...args: unknown[]) => {
          calls.push(args)
        },
      },
    } as never)

    await pikkuWorkflowOrchestratorFunc(
      {},
      { runId: 'run-2' },
      { rpc: rpc as never }
    )

    assert.deepEqual(calls, [['run-2', rpc]])
  })

  test('orchestrator throws when workflow service is missing', async () => {
    pikkuState(null, 'package', 'singletonServices', {} as never)

    await assert.rejects(
      () =>
        pikkuWorkflowOrchestratorFunc(
          {},
          { runId: 'run-2' },
          { rpc: {} as never }
        ),
      {
        message:
          'Workflow service not initialized: cannot orchestrate workflow for runId run-2',
      }
    )
  })

  test('sleeper calls executeWorkflowSleepCompleted on the workflow service', async () => {
    const calls: unknown[][] = []

    pikkuState(null, 'package', 'singletonServices', {
      workflowService: {
        executeWorkflowSleepCompleted: async (...args: unknown[]) => {
          calls.push(args)
        },
      },
    } as never)

    await pikkuWorkflowSleeperFunc({}, { runId: 'run-3', stepId: 'step-3' })

    assert.deepEqual(calls, [['run-3', 'step-3']])
  })

  test('sleeper throws when workflow service is missing', async () => {
    pikkuState(null, 'package', 'singletonServices', {} as never)

    await assert.rejects(
      () => pikkuWorkflowSleeperFunc({}, { runId: 'run-3', stepId: 'step-3' }),
      {
        message:
          'Workflow service not initialized: cannot execute workflow sleep completed for runId run-3, stepId step-3',
      }
    )
  })
})
