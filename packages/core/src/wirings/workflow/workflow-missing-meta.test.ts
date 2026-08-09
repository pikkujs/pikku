import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'
import { WorkflowNotFoundError } from './workflow-errors.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

const startRun = async (workflowName: string) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
  } as any)
  const service = new InMemoryWorkflowService()
  const runId = await service.createRun(workflowName, {}, false, '', {
    type: 'test',
  })
  return { service, runId }
}

describe('a run whose workflow has no generated meta', () => {
  test('reports missing metadata rather than crashing on an undefined meta', async () => {
    resetPikkuState()
    const { service, runId } = await startRun('flowWithoutMeta')

    // The registration exists, so this is not an unknown workflow — codegen or
    // the generated bootstrap import is what is missing.
    pikkuState(null, 'workflows', 'registrations').set('flowWithoutMeta', {
      name: 'flowWithoutMeta',
      func: async () => undefined,
    } as any)

    await assert.rejects(
      service.runWorkflowJob(runId, {}),
      (error: unknown) => {
        assert.ok(
          error instanceof PikkuMissingMetaError,
          `expected PikkuMissingMetaError, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message}`
        )
        assert.match(String((error as Error).message), /flowWithoutMeta/)
        return true
      }
    )
  })

  test('a workflow with neither meta nor a registration is still missing meta', async () => {
    resetPikkuState()
    const { service, runId } = await startRun('unknownFlow')

    await assert.rejects(
      service.runWorkflowJob(runId, {}),
      (error: unknown) => {
        assert.ok(
          error instanceof PikkuMissingMetaError,
          `expected PikkuMissingMetaError, got ${(error as Error)?.constructor?.name}`
        )
        return true
      }
    )
  })

  test('a registered workflow that does have meta gets past both guards', async () => {
    resetPikkuState()
    const { service, runId } = await startRun('flowWithMeta')

    pikkuState(null, 'workflows', 'meta', {
      flowWithMeta: {
        name: 'flowWithMeta',
        pikkuFuncId: 'flowWithMeta',
        source: 'dsl',
      },
    } as any)

    // Guards the tests above: without this the assertions would pass for a
    // service that threw PikkuMissingMetaError unconditionally.
    await assert.rejects(
      service.runWorkflowJob(runId, {}),
      (error: unknown) => {
        assert.ok(
          !(error instanceof PikkuMissingMetaError),
          'meta was present, so the missing-meta guard must not fire'
        )
        assert.ok(
          error instanceof WorkflowNotFoundError,
          `expected WorkflowNotFoundError, got ${(error as Error)?.constructor?.name}`
        )
        return true
      }
    )
  })
})
