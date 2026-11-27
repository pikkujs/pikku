import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { QueuedWorkflowHarness } from './queued-workflow-harness.js'
import type { WorkflowStatus } from '../../wirings/workflow/workflow.types.js'

const LIMIT = { timeout: 30_000 }

type Job = QueuedWorkflowHarness['queue'][number]

/**
 * A job that throws is dropped, as `harness.pump` does once it is out of
 * attempts. A store shared between tests can have a sweep queue jobs for the
 * runs of other tests.
 */
const runJob = async (h: QueuedWorkflowHarness, job: Job): Promise<void> => {
  const { runId, stepName, rpcName, data } = job.data
  await (
    stepName === undefined
      ? h.ws.orchestrateWorkflow(runId, h.rpc as never)
      : h.ws.executeWorkflowStep(runId, stepName, rpcName, data, h.rpc as never)
  ).catch(() => {})
}

/** Run queued jobs, leaving the jobs of the `held` steps for the test. */
const pumpExcept = async (
  h: QueuedWorkflowHarness,
  ...held: string[]
): Promise<Job[]> => {
  const kept: Job[] = []
  while (h.queue.length > 0) {
    const job = h.queue.shift()!
    if (held.includes(job.data.stepName)) kept.push(job)
    else await runJob(h, job)
  }
  return kept
}

/** A worker that claims `slow` and never comes back until it is let go. */
const hangingStep = (h: QueuedWorkflowHarness) => {
  let enter!: () => void
  let release!: () => void
  const entered = new Promise<void>((resolve) => (enter = resolve))
  const released = new Promise<void>((resolve) => (release = resolve))
  const undone: Array<{ ok?: boolean }> = []
  h.register('slow', {
    forward: async () => {
      enter()
      await released
      return {}
    },
    compensate: async (_data, context) => {
      undone.push({ ok: context?.ok })
    },
  })
  return { entered, release, undone }
}

/** Its worker stops renewing, and the lease it left lapses. */
const loseWorker = async (
  h: QueuedWorkflowHarness,
  runId: string,
  stepName: string
): Promise<void> => {
  const step = await h.ws.getStepState(runId, stepName)
  assert.equal(await h.ws.refreshStepLease(step.stepId, 1), true)
  await new Promise((resolve) => setTimeout(resolve, 25))
}

const sweep = (h: QueuedWorkflowHarness) =>
  h.ws.recoverStalledRuns({ stalledAfterMs: -60_000, limit: 1_000 })

const statusOf = async (h: QueuedWorkflowHarness, runId: string) =>
  (await h.run(runId)).status

/** Conformance for what recovery needs of a store to bring a stuck unwind home. */
export const defineUnwindRecoveryTests = (
  name: string,
  setup: () => Promise<QueuedWorkflowHarness>
): void => {
  describe(`${name}: an unwind waiting on a lost step`, () => {
    for (const trigger of ['a cancel', 'a failed sibling'] as const) {
      test(
        `recovery fails the step and finishes the unwind ${trigger} began`,
        LIMIT,
        async () => {
          const h = await setup()
          const slow = hangingStep(h)
          h.register('entry', h.ok())
          h.register('sib', h.boom())
          if (trigger === 'a cancel') {
            h.defineDsl('stuck', async (w) => {
              await w.do('slow', 'slow', {})
            })
          } else {
            h.defineGraph('stuck', 'entry', {
              entry: { next: ['sib', 'slow'] },
              sib: {},
              slow: {},
            })
          }
          const { runId } = await h.ws.startWorkflow(
            'stuck',
            {},
            { type: 'test' },
            h.rpc as never
          )
          const jobs = await pumpExcept(h, 'slow', 'sib')
          const job = (step: string) =>
            jobs.find((candidate) => candidate.data.stepName === step)!
          const worker = runJob(h, job('slow'))
          await slow.entered
          if (trigger === 'a cancel') {
            await h.ws.cancelRun(runId, h.rpc as never)
          } else {
            await runJob(h, job('sib'))
          }
          await pumpExcept(h)
          assert.equal(await statusOf(h, runId), 'compensating')

          // While its worker is there, a driver leaves the step alone.
          await h.ws.resumeWorkflow(runId)
          await pumpExcept(h)
          assert.equal(await statusOf(h, runId), 'compensating')
          assert.equal(
            (await h.ws.getStepState(runId, 'slow')).status,
            'running'
          )

          await loseWorker(h, runId, 'slow')
          const { resumed } = await sweep(h)
          await pumpExcept(h)

          assert.ok(resumed.includes(runId), 'recovery did not drive the run')
          assert.equal(await statusOf(h, runId), 'compensated')
          const step = await h.ws.getStepState(runId, 'slow')
          assert.equal(step.status, 'failed')
          assert.equal(step.attemptCount, 1)
          assert.match(step.error!.message, /lease expired|lost its worker/)
          assert.deepEqual(slow.undone, [{ ok: false }])
          assert.equal(h.log.filter((l) => l === 'do:slow').length, 1)

          slow.release()
          await worker
          assert.equal(
            (await h.ws.getStepState(runId, 'slow')).status,
            'failed'
          )
        }
      )
    }

    test(
      'every compensating run is listed for a driver, a page at a time',
      LIMIT,
      async () => {
        const h = await setup()
        const store = h.ws as unknown as {
          findRunsAwaitingDriver(
            before: Date,
            limit: number,
            offset: number
          ): Promise<string[]>
        }
        const runIn = async (status: WorkflowStatus) => {
          const runId = await h.ws.createRun('listed', {}, false, 'hash', {
            type: 'test',
          })
          // A forward step nothing claimed holds nothing out of the list.
          const step = await h.ws.insertStepState(runId, 'a', 'a', {})
          await h.ws.setStepScheduled(step.stepId)
          if (status !== 'running') {
            await h.ws.transitionRunStatus(runId, ['running'], status)
          }
          return runId
        }
        const all = async () => {
          const found: string[] = []
          const before = new Date(Date.now() + 60_000)
          for (let offset = 0; ; offset += 2) {
            const page = await store.findRunsAwaitingDriver(before, 2, offset)
            assert.ok(page.length <= 2)
            found.push(...page)
            if (page.length < 2) return found
          }
        }

        const waiting = [
          await runIn('compensating'),
          await runIn('compensating'),
          await runIn('compensating'),
        ]
        const others = [await runIn('running'), await runIn('suspended')]
        const finished = await runIn('compensating')
        await h.ws.transitionRunStatus(
          finished,
          ['compensating'],
          'compensated'
        )

        const found = await all()
        for (const runId of waiting) {
          assert.equal(found.filter((id) => id === runId).length, 1)
        }
        for (const runId of [...others, finished]) {
          assert.ok(!found.includes(runId))
        }
        const past = await store.findRunsAwaitingDriver(
          new Date(Date.now() - 60_000),
          1_000,
          0
        )
        assert.ok(!past.some((id) => waiting.includes(id)))
      }
    )
  })
}
