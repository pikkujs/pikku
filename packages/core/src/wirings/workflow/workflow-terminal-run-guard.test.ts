import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/** Records every run lease taken, which is the whole point of the guard. */
class LeaseSpyWorkflowService extends InMemoryWorkflowService {
  public readonly leased: string[] = []

  public override async withRunLease<T>(
    id: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.leased.push(id)
    return super.withRunLease(id, fn)
  }
}

/** A registered, fully described workflow, so nothing else can short-circuit. */
const startRun = async (): Promise<{
  service: LeaseSpyWorkflowService
  runId: string
  entered: () => boolean
}> => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
    queueService: { add: async () => 'job-1' },
  } as any)

  let bodyEntered = false
  const func = async () => {
    bodyEntered = true
  }
  pikkuState(null, 'workflows', 'meta', {
    flow: { name: 'flow', pikkuFuncId: 'flow', source: 'dsl' },
  } as any)
  pikkuState(null, 'workflows', 'registrations').set('flow', {
    name: 'flow',
    func,
  } as any)
  pikkuState(null, 'function', 'meta', {
    flow: {
      pikkuFuncId: 'flow',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    },
  } as any)
  pikkuState(null, 'function', 'functions').set('flow', { func } as any)

  const service = new LeaseSpyWorkflowService()
  const runId = await service.createRun('flow', {}, false, '', { type: 'test' })
  return { service, runId, entered: () => bodyEntered }
}

/**
 * The leak this guards, read straight off production: every granted advisory
 * lock held by an idle session mapped to a run that was already `failed`. The
 * orchestrator queue is at-least-once, so a message for a settled run is
 * routine — and answering it by taking the run lease and replaying the body is
 * how a run that can never move again ends up holding a lock and a pooled
 * connection while it waits on something that will never arrive.
 */
describe('an orchestrator message for a run that already settled', () => {
  for (const status of ['failed', 'completed', 'cancelled'] as const) {
    test(`a ${status} run is answered without taking its lock`, async () => {
      const { service, runId, entered } = await startRun()
      await service.updateRunStatus(runId, status)

      await service.runWorkflowJob(runId, {} as any)

      assert.deepEqual(
        service.leased,
        [],
        'the run lease was taken for a run that can never move again'
      )
      assert.equal(
        entered(),
        false,
        'the workflow body was replayed after the run had settled'
      )
    })
  }

  /**
   * Guards the tests above: they would pass just as well for a service that
   * refused to orchestrate anything at all.
   */
  test('a suspended run is still orchestrated', async () => {
    const { service, runId } = await startRun()
    await service.updateRunStatus(runId, 'suspended')

    await service.runWorkflowJob(runId, {} as any)

    assert.deepEqual(
      service.leased,
      [runId],
      'suspended ends a pass, not the run — it resumes when its signal arrives'
    )
  })
})
