import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import type {
  WorkflowPlannedStep,
  WorkflowRun,
  WorkflowRunWire,
} from './workflow.types.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

const installSingletons = () =>
  pikkuState(null, 'package', 'singletonServices', {
    queueService: { add: async () => {} },
    logger: silentLogger,
  } as any)

class SharedStoreWorkflowService extends InMemoryWorkflowService {
  constructor(private readonly runStore: Map<string, WorkflowRun>) {
    super()
  }

  protected override async createRunImpl(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<string> {
    const runId = await super.createRunImpl(
      workflowName,
      input,
      inline,
      graphHash,
      wire,
      options
    )
    this.runStore.set(runId, (await super.getRun(runId))!)
    return runId
  }

  override async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runStore.get(id) ?? null
  }
}

describe('whether a run is inline is decided by the run record, not by the process', () => {
  test('an instance that did not start the run still knows it is inline', async () => {
    installSingletons()
    const store = new Map<string, WorkflowRun>()
    const starter = new SharedStoreWorkflowService(store) as any
    const observer = new SharedStoreWorkflowService(store) as any

    const runId = await starter.createRun('flow', {}, true, 'hash', {
      type: 'test',
    })

    assert.equal(await starter.isInline(runId), true)
    assert.equal(
      await observer.isInline(runId),
      true,
      'a second instance dispatched a queued job for a run that is already executing in-process'
    )
  })

  test('an instance that did not start the run still knows it is queued', async () => {
    installSingletons()
    const store = new Map<string, WorkflowRun>()
    const starter = new SharedStoreWorkflowService(store) as any
    const observer = new SharedStoreWorkflowService(store) as any

    const runId = await starter.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })

    assert.equal(await starter.isInline(runId), false)
    assert.equal(await observer.isInline(runId), false)
  })

  test('asking whether an unknown run is inline creates no state', async () => {
    installSingletons()
    const store = new Map<string, WorkflowRun>()
    const ws = new SharedStoreWorkflowService(store) as any

    assert.equal(await ws.isInline('no-such-run'), false)
    assert.equal(ws.runContexts.size, 0)
  })
})

describe('a run that stops executing here leaves no per-run state behind', () => {
  const service = () => {
    installSingletons()
    return new InMemoryWorkflowService() as any
  }

  test('an inline run releases its ordinals when it unregisters', async () => {
    const ws = service()
    const before = ws.runContexts.size
    const runId = await ws.createRun('flow', {}, true, 'hash', { type: 'test' })

    await ws.inlineStep(runId, 'a', async () => 1)
    await ws.inlineStep(runId, 'a', async () => 2)
    ws.unregisterInlineRun(runId)

    assert.equal(
      ws.runContexts.size,
      before,
      'the ordinals map outlived the run that owned it'
    )
  })

  test('a completed run releases the ordinals a step left behind', async () => {
    const ws = service()
    const before = ws.runContexts.size
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })

    await ws.inlineStep(runId, 'a', async () => 1)
    await ws.updateRunStatus(runId, 'completed', 1)

    assert.equal(
      ws.runContexts.size,
      before,
      'a terminal run still held its replay state'
    )
  })

  test('a failed run releases the ordinals a step left behind', async () => {
    const ws = service()
    const before = ws.runContexts.size
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })

    await ws.inlineStep(runId, 'a', async () => 1)
    await ws.updateRunStatus(runId, 'failed', undefined, { message: 'boom' })

    assert.equal(ws.runContexts.size, before)
  })

  test('running a queued step releases its context when the step returns', async () => {
    const ws = service()
    const before = ws.runContexts.size
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'a', 'someRpc', {})

    await ws.executeWorkflowStep(
      runId,
      'a',
      'someRpc',
      {},
      {
        rpcWithWire: async () => {
          await ws.inlineStep(runId, 'nested', async () => 'ok')
          return 'ok'
        },
      }
    )

    assert.equal(
      ws.runContexts.size,
      before,
      'the step worker kept per-run state for a run it no longer executes'
    )
  })
})
