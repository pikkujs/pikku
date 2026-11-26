import type { AbortScope } from '../../function/abort-scope.js'
import type { Logger } from '../../services/logger.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import { isRunCancelled } from './workflow-constants.js'
import {
  WorkflowStepCancelledError,
  WorkflowStepTimeoutError,
} from './workflow-errors.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import type { RunContext } from './workflow-run-engine.types.js'
import type { WorkflowRun, WorkflowRpcStepOptions } from './workflow.types.js'

/** One attempt of a step: the signal its function is given, and how to end it. */
export type StepAttempt = {
  signal: AbortSignal
  abort(reason: unknown): void
  /** Stops watching for a cancel. Safe to call more than once. */
  close(): void
}

type StepAttemptSource = {
  runId: string
  /** `false` for a compensation, which a cancel never stops. */
  forward: boolean
  /** How often to read the run, for a cancel made by another process. */
  cancelCheckMs: number
  readRun: () => Promise<WorkflowRun | null>
  /** Registers for a cancel made in this process; returns how to deregister. */
  onCancel: (cancel: () => void) => () => void
  /** Aborts if the lease the attempt runs under is lost. */
  leaseLost?: AbortSignal
  logger: () => Logger | undefined
}

/** Adds a step's cancel to its run's context; returns how to remove it. */
export const trackStepCancel = (
  context: Pick<RunContext, 'stepCancels'>,
  cancel: () => void,
  onRemoved: () => void
): (() => void) => {
  const cancels = (context.stepCancels ??= new Set())
  cancels.add(cancel)
  return () => {
    cancels.delete(cancel)
    onRemoved()
  }
}

const watchForCancel = (
  { runId, cancelCheckMs, readRun, logger }: StepAttemptSource,
  cancel: () => void
): (() => void) => {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    timer = setTimeout(() => void check(), cancelCheckMs)
    timer.unref?.()
  }
  const check = async () => {
    const run = await readRun().catch((error) => {
      logger()?.warn(
        `Workflow run ${runId}: could not check for a cancel; checking again`,
        error
      )
      return null
    })
    if (stopped) return
    if (run && isRunCancelled(run)) return cancel()
    schedule()
  }
  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

export const openStepAttempt = (source: StepAttemptSource): StepAttempt => {
  const controller = new AbortController()
  const abort = (reason: unknown) => controller.abort(reason)
  const cleanups: Array<() => void> = []

  if (source.forward) {
    const cancel = () => abort(new WorkflowStepCancelledError(source.runId))
    cleanups.push(source.onCancel(cancel), watchForCancel(source, cancel))
  }

  const { leaseLost } = source
  if (leaseLost) {
    const lose = () => abort(leaseLost.reason)
    if (leaseLost.aborted) lose()
    leaseLost.addEventListener('abort', lose)
    cleanups.push(() => leaseLost.removeEventListener('abort', lose))
  }

  return {
    signal: controller.signal,
    abort,
    close: () => {
      for (const cleanup of cleanups.splice(0)) cleanup()
    },
  }
}

/** What a step's signal adds to the wire besides `workflowStep.signal`. */
export const stepSignalWire = (
  signal: AbortSignal | undefined
): { abortScope?: AbortScope } =>
  signal
    ? {
        abortScope: {
          get abandoned() {
            return signal.aborted
          },
          get reason() {
            return (signal.reason as Error | undefined)?.message
          },
        },
      }
    : {}

/** The longest delay a timer holds; a longer one fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/** A step's `timeout` as every store can hold it, refusing one that cannot be timed. */
const normalizeStepTimeout = (timeout: string | number): string => {
  const ms = getDurationInMilliseconds(timeout)
  if (!Number.isInteger(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new Error(
      `Invalid step timeout ${JSON.stringify(timeout)}: it must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}`
    )
  }
  return `${ms}ms`
}

/** A function-closure step cannot be timed, whatever an untyped caller passes. */
export const assertNoClosureTimeout = (
  stepName: string,
  options: object | undefined
): void => {
  if (options && 'timeout' in options && options.timeout !== undefined) {
    throw new Error(
      `Workflow step '${stepName}': a timeout is not supported on a function step`
    )
  }
}

/** The deadline a `workflow.do()` of an RPC asked for, if it can be applied. */
export const rpcStepTimeout = (
  stepName: string,
  rpcName: string,
  options: WorkflowRpcStepOptions | undefined
): string | undefined => {
  if (options?.timeout === undefined) return undefined
  if (resolveWorkflowMeta(rpcName)) {
    throw new Error(
      `Workflow step '${stepName}': a timeout is not supported on a child workflow step ('${rpcName}')`
    )
  }
  return normalizeStepTimeout(options.timeout)
}

/**
 * Run one attempt of a step against its deadline. Past it the attempt is
 * aborted and fails without waiting for `work`, whose late outcome is dropped.
 */
export const runWithStepDeadline = async <T>(
  {
    runId,
    stepName,
    timeout,
    attempt,
  }: {
    runId: string
    stepName: string
    timeout: string | number | undefined
    attempt: StepAttempt | undefined
  },
  work: () => Promise<T>
): Promise<T> => {
  if (timeout === undefined) return work()
  const timeoutMs = getDurationInMilliseconds(timeout)
  let expired: WorkflowStepTimeoutError | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // Left referenced: a hung function may hold nothing else that keeps the
  // process alive until its deadline.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = new WorkflowStepTimeoutError(runId, stepName, timeoutMs)
      reject(expired)
      attempt?.abort(expired)
    }, timeoutMs)
  })
  const running = (async () => work())()
  running.catch(() => {})
  try {
    const result = await Promise.race([running, deadline])
    if (expired) throw expired
    return result
  } catch (error) {
    // A function that rejects as its signal aborts still timed out.
    throw expired ?? error
  } finally {
    clearTimeout(timer)
  }
}
