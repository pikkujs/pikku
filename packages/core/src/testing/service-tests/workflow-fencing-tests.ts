import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { PikkuWorkflowService } from '../../wirings/workflow/pikku-workflow-service.js'
import type { StepState } from '../../wirings/workflow/workflow.types.js'
import { RPCNotFoundError } from '../../wirings/rpc/rpc-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { ConsoleLogger } from '../../services/logger-console.js'
import { LogLevel } from '../../services/logger.js'
import type { PikkuRPC } from '../../wirings/rpc/rpc-types.js'
import type { CoreSingletonServices } from '../../types/core.types.js'

/** A workflow service under test, and the means to kill the worker holding a step. */
export type WorkflowFencingHarness = {
  service: PikkuWorkflowService
  /**
   * Make the step's lease read as lapsed, as it would once its worker died, on
   * whichever clock the store judges leases by.
   */
  lapseLease: (runId: string, stepName: string) => Promise<void>
}

const STEP = 'charge'
const RPC = 'charge:card'
const LEASE_MS = 60_000
const RACES = 25
const createSilentLogger = () => {
  const logger = new ConsoleLogger()
  logger.setLevel(LogLevel.critical)
  return logger
}

const superseded = (e: Error) => e.name === 'WorkflowStepSupersededError'

/**
 * Conformance suite for a workflow service that fences a step's writes to the
 * claim that made them. Each test gets a fresh harness.
 *
 * Every scenario has a stale attempt — claimed, then its lease lapsed and the
 * step claimed again — and the attempt that replaced it.
 */
export const defineWorkflowFencingTests = (
  name: string,
  create: () => Promise<WorkflowFencingHarness>
): void => {
  describe(`WorkflowService fencing [${name}]`, () => {
    const claim = (
      { service }: WorkflowFencingHarness,
      runId: string
    ): Promise<StepState | null> =>
      service['claimStepForExecution'](runId, STEP, RPC, LEASE_MS)

    const startRun = async ({ service }: WorkflowFencingHarness) => {
      const runId = await service.createRun('fenced', {}, false, 'hash', {
        type: 'test',
      })
      await service.insertStepState(runId, STEP, RPC, {}, { retries: 5 })
      return runId
    }

    /** Claim the step, lose its worker, and claim it again. */
    const supersede = async (h: WorkflowFencingHarness, runId: string) => {
      const stale = await claim(h, runId)
      assert.ok(stale, 'the first dispatch did not get the step')
      await h.lapseLease(runId, STEP)
      const current = await claim(h, runId)
      assert.ok(current, 'the lapsed step was not claimed again')
      assert.equal(current.attemptCount, stale.attemptCount + 1)
      return { stale, current }
    }

    const stepOf = (h: WorkflowFencingHarness, runId: string) =>
      h.service.getStepState(runId, STEP)

    const leaseOf = async (h: WorkflowFencingHarness, runId: string) =>
      (await stepOf(h, runId)).leaseExpiresAt?.getTime()

    /** Runs `fn` with the engine's singletons quiet, then puts back what was there. */
    const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
      const previous = pikkuState(null, 'package', 'singletonServices')
      pikkuState(null, 'package', 'singletonServices', {
        ...previous,
        logger: createSilentLogger(),
      } as CoreSingletonServices)
      try {
        return await fn()
      } finally {
        pikkuState(null, 'package', 'singletonServices', previous)
      }
    }

    /**
     * Dispatch the step through the engine, with an RPC that loses the step to
     * a newer claim while it runs and then does `outcome`.
     */
    const dispatchStale = (
      h: WorkflowFencingHarness,
      runId: string,
      outcome: () => unknown
    ) =>
      quietly(async () => {
        let current: StepState | null = null
        const staleWorker: Pick<PikkuRPC, 'rpcWithWire'> = {
          rpcWithWire: async <In, Out>() => {
            await h.lapseLease(runId, STEP)
            current = await claim(h, runId)
            return outcome() as Out
          },
        }
        const surfaced = await h.service
          .executeWorkflowStep(runId, STEP, RPC, {}, staleWorker as PikkuRPC)
          .then(
            () => undefined,
            (e: Error) => e
          )
        assert.ok(current, 'the step was never claimed from under the worker')
        return { surfaced, current: current as StepState }
      })

    test("a stale attempt's result is refused and the current attempt's lands", async () => {
      const h = await create()
      const runId = await startRun(h)
      const { stale, current } = await supersede(h, runId)

      await assert.rejects(
        h.service.setStepResult(stale.stepId, 'stale', stale.attemptCount),
        superseded
      )
      await h.service.setStepResult(
        current.stepId,
        'fresh',
        current.attemptCount
      )

      const step = await stepOf(h, runId)
      assert.equal(step.status, 'succeeded')
      assert.equal(step.result, 'fresh')
      assert.equal(step.attemptCount, current.attemptCount)

      const history = (await h.service.getRunHistory(runId)).filter(
        (attempt) => attempt.stepName === STEP
      )
      assert.equal(history.length, 2, 'each claim keeps its own attempt')
      assert.equal(
        history[0]!.status,
        'running',
        'the stale attempt was recorded with an outcome it was refused'
      )
      assert.notEqual(history[0]!.result, 'stale')
      assert.equal(history[1]!.status, 'succeeded')
      assert.equal(history[1]!.result, 'fresh')
    })

    test("a stale attempt's error is refused and does not fail the step", async () => {
      const h = await create()
      const runId = await startRun(h)
      const { stale, current } = await supersede(h, runId)

      await assert.rejects(
        h.service.setStepError(
          stale.stepId,
          new Error('stale'),
          stale.attemptCount
        ),
        superseded
      )

      const step = await stepOf(h, runId)
      assert.equal(step.status, 'running', 'the stale attempt failed the step')
      assert.equal(step.error, undefined)
      assert.equal(step.attemptCount, current.attemptCount)
    })

    test('a stale attempt cannot renew the lease, nor move the one that replaced it', async () => {
      const h = await create()
      const runId = await startRun(h)
      const { stale, current } = await supersede(h, runId)
      const held = await leaseOf(h, runId)

      assert.equal(
        await h.service.refreshStepLease(
          stale.stepId,
          10 * LEASE_MS,
          stale.attemptCount
        ),
        false,
        'the stale attempt was told it still holds the step'
      )
      assert.equal(await leaseOf(h, runId), held, 'the stale renewal landed')

      assert.equal(
        await h.service.refreshStepLease(
          stale.stepId,
          null,
          stale.attemptCount
        ),
        false
      )
      assert.equal(await leaseOf(h, runId), held, 'the stale release landed')

      assert.equal(
        await h.service.refreshStepLease(
          current.stepId,
          10 * LEASE_MS,
          current.attemptCount
        ),
        true
      )
    })

    test('a stale attempt cannot overwrite a step the current attempt already succeeded', async () => {
      const h = await create()
      const runId = await startRun(h)
      const { stale, current } = await supersede(h, runId)
      await h.service.setStepResult(
        current.stepId,
        'fresh',
        current.attemptCount
      )

      await assert.rejects(
        h.service.setStepResult(stale.stepId, 'stale', stale.attemptCount),
        superseded
      )
      await assert.rejects(
        h.service.setStepError(
          stale.stepId,
          new Error('stale'),
          stale.attemptCount
        ),
        superseded
      )

      const step = await stepOf(h, runId)
      assert.equal(step.status, 'succeeded')
      assert.equal(step.result, 'fresh')
      assert.equal(step.error, undefined)
    })

    test('a stale attempt cannot overwrite a step the current attempt already failed', async () => {
      const h = await create()
      const runId = await startRun(h)
      const { stale, current } = await supersede(h, runId)
      await h.service.setStepError(
        current.stepId,
        new Error('fresh'),
        current.attemptCount
      )

      await assert.rejects(
        h.service.setStepResult(stale.stepId, 'stale', stale.attemptCount),
        superseded
      )

      const step = await stepOf(h, runId)
      assert.equal(step.status, 'failed')
      assert.equal(step.error?.message, 'fresh')
      assert.equal(step.result, undefined)
    })

    test('when both attempts write at once, only the current one ever lands', async () => {
      const h = await create()
      for (let i = 0; i < RACES; i++) {
        const runId = await startRun(h)
        const { stale, current } = await supersede(h, runId)
        const staleWrite = () =>
          i % 2 === 0
            ? h.service.setStepResult(stale.stepId, 'stale', stale.attemptCount)
            : h.service.setStepError(
                stale.stepId,
                new Error('stale'),
                stale.attemptCount
              )
        const currentWrite = () =>
          h.service.setStepResult(current.stepId, 'fresh', current.attemptCount)

        const [staleOutcome, currentOutcome] =
          i % 3 === 0
            ? (
                await Promise.allSettled([currentWrite(), staleWrite()])
              ).reverse()
            : await Promise.allSettled([staleWrite(), currentWrite()])

        assert.equal(staleOutcome!.status, 'rejected', `race ${i}`)
        assert.ok(
          superseded((staleOutcome as PromiseRejectedResult).reason),
          `race ${i}: ${(staleOutcome as PromiseRejectedResult).reason}`
        )
        assert.equal(currentOutcome!.status, 'fulfilled', `race ${i}`)
        const step = await stepOf(h, runId)
        assert.equal(step.status, 'succeeded', `race ${i}`)
        assert.equal(step.result, 'fresh', `race ${i}`)
      }
    })

    test('a third claim fences out both attempts before it', async () => {
      const h = await create()
      const runId = await startRun(h)
      const { stale: first, current: second } = await supersede(h, runId)
      await h.lapseLease(runId, STEP)
      const third = await claim(h, runId)
      assert.ok(third)
      assert.equal(third.attemptCount, second.attemptCount + 1)
      const held = await leaseOf(h, runId)

      for (const stale of [first, second]) {
        await assert.rejects(
          h.service.setStepResult(stale.stepId, 'stale', stale.attemptCount),
          superseded,
          `attempt ${stale.attemptCount} recorded a result`
        )
        await assert.rejects(
          h.service.setStepError(
            stale.stepId,
            new Error('stale'),
            stale.attemptCount
          ),
          superseded,
          `attempt ${stale.attemptCount} recorded an error`
        )
        assert.equal(
          await h.service.refreshStepLease(
            stale.stepId,
            10 * LEASE_MS,
            stale.attemptCount
          ),
          false,
          `attempt ${stale.attemptCount} renewed the lease`
        )
      }
      assert.equal(await leaseOf(h, runId), held)

      await h.service.setStepResult(third.stepId, 'third', third.attemptCount)
      const step = await stepOf(h, runId)
      assert.equal(step.status, 'succeeded')
      assert.equal(step.result, 'third')
    })

    test('a superseded dispatch whose RPC is missing neither fails the step nor suspends the run', async () => {
      const h = await create()
      const runId = await startRun(h)

      const { surfaced, current } = await dispatchStale(h, runId, () => {
        throw new RPCNotFoundError(RPC)
      })

      const step = await stepOf(h, runId)
      assert.equal(step.status, 'running', 'the stale attempt failed the step')
      assert.equal(step.attemptCount, current.attemptCount)
      assert.equal(
        (await h.service.getRun(runId))?.status,
        'running',
        'the stale attempt suspended the run'
      )
      assert.equal(surfaced, undefined, 'a superseded dispatch ends quietly')
    })

    test('a superseded dispatch whose RPC throws ends quietly and leaves the step to its new owner', async () => {
      const h = await create()
      const runId = await startRun(h)

      const { surfaced, current } = await dispatchStale(h, runId, () => {
        throw new Error('the card was declined')
      })

      assert.equal(surfaced, undefined, 'the stale failure surfaced')
      const step = await stepOf(h, runId)
      assert.equal(step.status, 'running', 'the stale attempt failed the step')
      assert.equal(step.error, undefined)
      assert.equal(step.attemptCount, current.attemptCount)
      assert.equal((await h.service.getRun(runId))?.status, 'running')
    })

    test('a superseded dispatch whose RPC succeeds does not record its result', async () => {
      const h = await create()
      const runId = await startRun(h)

      const { surfaced, current } = await dispatchStale(h, runId, () => 'stale')

      assert.equal(surfaced, undefined)
      const step = await stepOf(h, runId)
      assert.equal(step.status, 'running', 'the stale result landed')
      assert.equal(step.result, undefined)
      assert.equal(step.attemptCount, current.attemptCount)
    })
  })
}
