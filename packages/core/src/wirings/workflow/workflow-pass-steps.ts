import { WorkflowAsyncException } from './workflow-errors.js'
import type { WorkflowWireSteps } from './workflow-wire.js'

/**
 * The steps one pass over a run has started. The pass holds the run until every
 * one of them has ended, so none is left running with nothing to answer for it.
 *
 * knowledge: decisions/internals/a-pass-ends-only-after-every-step-it-started.md
 */
export class PassSteps {
  private readonly running = new Set<Promise<unknown>>()
  private closed = false

  /** Start `step` as part of the pass, or reject with `refusal` once it is over. */
  start<T>(refusal: () => Error, step: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(refusal())
    const started = step()
    const forget = () => {
      this.running.delete(ended)
    }
    const ended: Promise<void> = started.then(forget, forget)
    this.running.add(ended)
    return started
  }

  /** Resolves once nothing is running, steps started while waiting included. */
  async waitForAll(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all(this.running)
      // A task later, whatever those steps resumed has asked for its next one.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  /** `waitForAll`, and no step starts afterwards. */
  async close(): Promise<void> {
    await this.waitForAll()
    this.closed = true
  }
}

/** Run `step` as part of `pass`, when a pass is what asked for it. */
export const inPass = <T>(
  pass: PassSteps | undefined,
  runId: string,
  stepName: string,
  step: () => Promise<T>
): Promise<T> =>
  pass
    ? pass.start(() => new WorkflowAsyncException(runId, stepName), step)
    : step()

/** The steps of a run's wire, each one run as part of `pass`. */
export const stepsInPass = (
  pass: PassSteps | undefined,
  runId: string,
  steps: WorkflowWireSteps
): WorkflowWireSteps => {
  const bind =
    <A extends [string, ...unknown[]], T>(step: (...args: A) => Promise<T>) =>
    (...args: A) =>
      inPass(pass, runId, args[0], () => step(...args))
  return {
    ...steps,
    rpcStep: bind(steps.rpcStep),
    inlineStep: bind(steps.inlineStep),
    sleepStep: bind(steps.sleepStep),
    suspendStep: bind(steps.suspendStep),
    approvalStep: bind(steps.approvalStep),
  }
}
