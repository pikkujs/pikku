/**
 * UNHAPPY-PATH workflows for retry + idempotency.
 *
 * Steps are `inline: false` so they dispatch through the real queue (pg-boss /
 * bullmq) and are retried by queue redelivery — the durability path. Each step
 * records its `invocationId` / `stepId` / `attemptCount` into the shared tracker
 * so the runner can assert exactly what happened under failure.
 */
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku'
import { tracker } from '../runners/retry-idempotency-tracker.js'

/**
 * Fails its first `failTimes` executions, then succeeds. No dedupe — used to
 * count executions (retries:0, default-exhaust, default-recover).
 */
export const flakyStep = pikkuSessionlessFunc<
  { trackerKey: string; failTimes: number },
  { ok: boolean }
>({
  inline: false,
  func: async ({ logger }, data, { workflowStep }) => {
    tracker.record(data.trackerKey, {
      invocationId: workflowStep!.invocationId,
      stepId: workflowStep!.stepId,
      attemptCount: workflowStep!.attemptCount,
    })
    const soFar = tracker.count(data.trackerKey)
    if (soFar <= data.failTimes) {
      logger.info(
        `[flakyStep] ${data.trackerKey} execution ${soFar} (attempt ${workflowStep!.attemptCount}) → fail`
      )
      throw new Error(`flakyStep ${data.trackerKey} failing execution ${soFar}`)
    }
    return { ok: true }
  },
})

/**
 * Applies a side effect exactly once per `invocationId` BEFORE crashing, so a
 * retry must NOT re-apply it. Demonstrates invocationId-keyed idempotency: after
 * N crashing executions the side effect ran exactly once.
 */
export const idempotentStep = pikkuSessionlessFunc<
  { trackerKey: string; failTimes: number },
  { ok: boolean }
>({
  inline: false,
  func: async ({ logger }, data, { workflowStep }) => {
    const invocationId = workflowStep!.invocationId
    tracker.record(data.trackerKey, {
      invocationId,
      stepId: workflowStep!.stepId,
      attemptCount: workflowStep!.attemptCount,
    })
    const firstTime = tracker.applyOnce(data.trackerKey, invocationId)
    logger.info(
      `[idempotentStep] ${data.trackerKey} invocation ${invocationId} sideEffect=${firstTime ? 'applied' : 'deduped'}`
    )
    const soFar = tracker.count(data.trackerKey)
    if (soFar <= data.failTimes) {
      // Crash AFTER the side effect — the retry sees the same invocationId and
      // skips re-applying it.
      throw new Error(`idempotentStep crash after side effect ${soFar}`)
    }
    return { ok: true }
  },
})

// ── Workflows ────────────────────────────────────────────────────────────────

/** Step crashes `failTimes` times then succeeds; explicit retries cover it. */
export const idempotentDedupeWorkflow = pikkuWorkflowFunc<
  { trackerKey: string; failTimes: number },
  { ok: boolean }
>({
  func: async (_services, data, { workflow }) => {
    await workflow.do('idempotent step', 'idempotentStep', data, {
      retries: 5,
      retryDelay: 0,
    })
    return { ok: true }
  },
  tags: ['test', 'retry', 'idempotency'],
})

/** retries:0 — must run EXACTLY once and fail the workflow (no sneaky retries). */
export const noRetryWorkflow = pikkuWorkflowFunc<
  { trackerKey: string },
  { ok: boolean }
>({
  func: async (_services, data, { workflow }) => {
    await workflow.do(
      'no retry step',
      'flakyStep',
      { trackerKey: data.trackerKey, failTimes: 999 },
      { retries: 0 }
    )
    return { ok: true }
  },
  tags: ['test', 'retry'],
})

/** No retries option → default policy; always fails → exhausts the default. */
export const defaultRetryExhaustWorkflow = pikkuWorkflowFunc<
  { trackerKey: string },
  { ok: boolean }
>({
  func: async (_services, data, { workflow }) => {
    await workflow.do(
      'default exhaust step',
      'flakyStep',
      { trackerKey: data.trackerKey, failTimes: 999 },
      // retryDelay only (0) — leaves `retries` to the workflow default so we can
      // assert what that default actually is, while keeping the test fast.
      { retryDelay: 0 }
    )
    return { ok: true }
  },
  tags: ['test', 'retry'],
})

/** No retries option → default policy; recovers before the default is exhausted. */
export const defaultRetryRecoverWorkflow = pikkuWorkflowFunc<
  { trackerKey: string; failTimes: number },
  { ok: boolean }
>({
  func: async (_services, data, { workflow }) => {
    await workflow.do(
      'default recover step',
      'flakyStep',
      data,
      { retryDelay: 0 }
    )
    return { ok: true }
  },
  tags: ['test', 'retry'],
})
