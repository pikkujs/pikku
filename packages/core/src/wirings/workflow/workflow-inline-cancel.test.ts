import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  QueuedWorkflowHarness,
  type Handler,
} from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'

let h: QueuedWorkflowHarness

const register = (name: string, handler: Handler) =>
  h.register(name, { ...handler, queued: false })

const cancelFrom = (wire: any) =>
  h.ws.cancelRun(
    wire.workflow?.runId ?? wire.workflowStep?.runId,
    h.rpc as never
  )

const startInline = async (name: string) => {
  let runId: string | undefined
  await h.ws
    .startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
      inline: true,
      onRunCreated: (id) => (runId = id),
    })
    .then((started) => (runId = started.runId))
    .catch(() => {})
  return h.run(runId!)
}

const dsl = (name: string, steps: string[]) =>
  h.defineDsl(name, async (workflow) => {
    for (const step of steps) await workflow.do(step, step, {})
    return { done: true }
  })

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
})

describe('cancelling an inline run from inside a step', () => {
  for (const shape of ['dsl', 'graph'] as const) {
    const define = (name: string, first: string, last: string) =>
      shape === 'dsl'
        ? dsl(name, [first, last])
        : h.defineGraph(name, first, { [first]: { next: last }, [last]: {} })

    test(`${shape}: the run stays cancelled and runs nothing further`, async () => {
      register('first', {
        forward: async (_data, wire) => {
          await cancelFrom(wire)
          return {}
        },
      })
      register('last', h.ok())
      define('flow', 'first', 'last')

      const run = await startInline('flow')

      assert.equal(run.status, 'cancelled')
      assert.equal(run.error?.code, 'WORKFLOW_CANCELLED')
      assert.deepEqual(h.log, ['do:first'])
    })

    test(`${shape}: the step in flight is undone once it finishes`, async () => {
      register('first', {
        forward: async (_data, wire) => {
          await cancelFrom(wire)
          return {}
        },
        compensate: async () => {},
      })
      register('last', h.ok())
      define('flow', 'first', 'last')

      const run = await startInline('flow')

      assert.equal(run.status, 'compensated')
      assert.deepEqual(h.log, ['do:first', 'undo:first'])
    })

    test(`${shape}: a step that fails after the cancel does not fail the run`, async () => {
      register('first', {
        forward: async (_data, wire) => {
          await cancelFrom(wire)
          throw new Error('torn down')
        },
      })
      register('last', h.ok())
      define('flow', 'first', 'last')

      assert.equal((await startInline('flow')).status, 'cancelled')
    })
  }

  test('dsl: a step retrying is not tried again', async () => {
    register('flaky', {
      forward: async (_data, wire) => {
        await cancelFrom(wire)
        throw new Error('flaky')
      },
    })
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('Flaky', 'flaky', {}, { retries: 3 })
    })

    assert.equal((await startInline('flow')).status, 'cancelled')
    assert.deepEqual(h.log, ['do:flaky'])
  })

  test('dsl: a suspend reached after the cancel leaves it cancelled', async () => {
    register('first', {
      forward: async (_data, wire) => {
        await cancelFrom(wire)
        return {}
      },
    })
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('First', 'first', {})
      await workflow.suspend('hold')
    })

    assert.equal((await startInline('flow')).status, 'cancelled')
  })

  test('a parent cancelled from inside its inline child stops after it', async () => {
    register('inner', {
      forward: async (_data, wire) => {
        const child = await h.run(wire.workflowStep.runId)
        await h.ws.cancelRun(child.wire.parentRunId!, h.rpc as never)
        return {}
      },
    })
    register('after', h.ok())
    dsl('child', ['inner'])
    h.defineDsl('parent', async (workflow) => {
      await workflow.do('Child', 'child', {})
      await workflow.do('After', 'after', {})
    })

    assert.equal((await startInline('parent')).status, 'cancelled')
    assert.deepEqual(h.log, ['do:inner'])
  })

  test('a run nothing cancelled still completes', async () => {
    register('first', h.ok())
    dsl('flow', ['first'])

    const run = await startInline('flow')

    assert.equal(run.status, 'completed')
    assert.deepEqual(run.output, { done: true })
  })
})
