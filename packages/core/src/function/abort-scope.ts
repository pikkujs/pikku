import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Raised by {@link beginChanges} when the caller has gone away before anything
 * was changed. Distinct from a failure: nothing happened, so there is nothing
 * to report, retry or apologise for.
 */
export class AbandonedError extends Error {
  constructor(reason?: string) {
    super(
      reason
        ? `Aborted before making changes: ${reason}`
        : 'Aborted before making changes'
    )
    this.name = 'AbandonedError'
  }
}

export interface AbortScope {
  /** Whether whatever asked for this work has gone away. */
  readonly abandoned: boolean
  /** Why, when known — an interrupt reason, a disconnect, a cancellation. */
  readonly reason?: string
  /** Called by `beginChanges()` once a function commits to mutating. */
  onBeginChanges?: () => void
}

/**
 * The ambient "is my caller still there?" signal.
 *
 * Ambient rather than a parameter because the question is the same one for
 * every wiring — an agent run that was interrupted, an HTTP request whose
 * client disconnected, a cancelled workflow — and threading it through every
 * signature would mean changing every function that merely sits between the
 * wiring and the mutation.
 */
const scopeStorage = new AsyncLocalStorage<AbortScope>()

/** Run `fn` with an abort scope that `beginChanges()` will observe. */
export const runInAbortScope = <T>(scope: AbortScope, fn: () => T): T =>
  scopeStorage.run(scope, fn)

/** The current scope, if the caller is running inside one. */
export const getAbortScope = (): AbortScope | undefined =>
  scopeStorage.getStore()

/**
 * Declare that everything after this line changes something.
 *
 * ```ts
 * const plan = await computePlan(input)   // interruptible, costs nothing to redo
 * await beginChanges()
 * await db.deleteProject(input.projectId) // past the point of no return
 * ```
 *
 * Two things happen here. If the caller has already gone away it throws, so the
 * mutation never runs and the interrupt is clean — nothing happened, and the
 * user is told nothing because there is nothing to tell. If the caller is still
 * there it marks this call as mutating, so an interrupt landing *after* this
 * point produces an `undelivered` note on the thread rather than silently
 * discarding work that did happen.
 *
 * It throws rather than returning a boolean on purpose: `if (await ...)` invites
 * ignoring the answer, and the failure mode of ignoring it is a mutation nobody
 * asked for.
 *
 * Entirely cooperative, and safe to call anywhere — outside a scope it is a
 * no-op, so a function does not need to know how it was invoked. A function
 * that never calls it keeps the conservative default: if it is not marked
 * `readonly`, an interrupt assumes it changed something and says so. The tool
 * that forgot to call this is exactly the one that cannot be assumed harmless.
 */
export const beginChanges = async (): Promise<void> => {
  const scope = scopeStorage.getStore()
  if (!scope) return
  if (scope.abandoned) {
    throw new AbandonedError(scope.reason)
  }
  scope.onBeginChanges?.()
}
