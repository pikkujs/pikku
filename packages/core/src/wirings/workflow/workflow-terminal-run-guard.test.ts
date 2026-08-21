import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/** Records every run lock taken, which is the whole point of the guard. */
class LockSpyWorkflowService extends InMemoryWorkflowService {
  public readonly locked: string[] = []

  public override async withRunLock<T>(
    id: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.locked.push(id)
    return super.withRunLock(id, fn)
  }
}

/** A registered, fully described workflow, so nothing else can short-circuit. */
const startRun = async (): Promise<{
  service: LockSpyWorkflowService
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

  const service = new LockSpyWorkflowService()
  const runId = await service.createRun('flow', {}, false, '', { type: 'test' })
  return { service, runId, entered: () => bodyEntered }
}

/**
 * The leak this guards, read straight off production: every granted advisory
 * lock held by an idle session mapped to a run that was already `failed`. The
 * orchestrator queue is at-least-once, so a message for a settled run is
 * routine — and answering it by taking the run lock and replaying the body is
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
        service.locked,
        [],
        'the run lock was taken for a run that can never move again'
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
      service.locked,
      [runId],
      'suspended ends a pass, not the run — it resumes when its signal arrives'
    )
  })
})
