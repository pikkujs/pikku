import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { DEFAULT_STEP_RETRIES } from './workflow-constants.js'

let h: QueuedWorkflowHarness

const modes = [
  ['inline', { inline: true }],
  ['queued', undefined],
] as const

const count = (entry: string) => h.log.filter((e) => e === entry).length

/** An inline DSL run rethrows what failed it, so the run id comes from the hook. */
const start = async (name: string, options?: { inline?: boolean }) => {
  let runId = ''
  await h.ws
    .startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
      ...options,
      onRunCreated: (id: string) => {
        runId = id
      },
    })
    .catch(() => {})
  await h.pump()
  return runId
}

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
})

describe('`retries: N` is N+1 attempts, inline and queued alike', () => {
  for (const [mode, options] of modes) {
    const queued = mode === 'queued'

    for (const retries of [0, 1, 2]) {
      const attempts = retries + 1

      test(`${mode} rpc step, retries: ${retries}`, async () => {
        h.register('broken', { ...h.boom(), queued })
        h.defineDsl('flow', async (w) => {
          await w.do('Broken', 'broken', {}, { retries })
        })

        const runId = await start('flow', options)

        assert.equal((await h.run(runId)).status, 'failed')
        assert.equal(count('do:broken'), attempts)
      })

      test(`${mode} function step, retries: ${retries}`, async () => {
        let calls = 0
        h.defineDsl('flow', async (w) => {
          await w.do(
            'Broken',
            async () => {
              calls++
              throw new Error('boom')
            },
            { retries }
          )
        })

        const runId = await start('flow', options)

        assert.equal((await h.run(runId)).status, 'failed')
        assert.equal(calls, attempts)
      })

      test(`${mode} graph node, retries: ${retries}`, async () => {
        h.register('broken', { ...h.boom(), queued })
        h.defineGraph('flow', 'broken', { broken: { retries } })

        const runId = await start('flow', options)

        assert.equal((await h.run(runId)).status, 'failed')
        assert.equal(count('do:broken'), attempts)
      })

      test(`${mode} compensation, retries: ${retries}`, async () => {
        h.register('undoable', {
          ...h.ok(),
          queued,
          compensate: async () => {
            throw new Error('cannot undo')
          },
        })
        h.register('broken', { ...h.boom(), queued })
        h.defineDsl('flow', async (w) => {
          await w.do('Undoable', 'undoable', {}, { retries })
          await w.do('Broken', 'broken', {}, { retries: 0 })
        })

        const runId = await start('flow', options)

        assert.equal((await h.run(runId)).status, 'compensation_failed')
        assert.equal(count('undo:undoable'), attempts)
      })
    }

    test(`${mode} retries: 1 recovers from one failure`, async () => {
      let calls = 0
      h.register('flaky', {
        queued,
        forward: async () => {
          if (++calls === 1) throw new Error('flaky')
          return {}
        },
      })
      h.defineDsl('flow', async (w) => {
        await w.do('Flaky', 'flaky', {}, { retries: 1 })
      })

      const runId = await start('flow', options)

      assert.equal((await h.run(runId)).status, 'completed')
      assert.equal(calls, 2)
    })

    test(`${mode} rpc step keeps the default retries`, async () => {
      h.register('broken', { ...h.boom(), queued })
      h.defineDsl('flow', async (w) => {
        await w.do('Broken', 'broken', {})
      })

      await start('flow', options)

      assert.equal(count('do:broken'), DEFAULT_STEP_RETRIES + 1)
    })
  }
})
