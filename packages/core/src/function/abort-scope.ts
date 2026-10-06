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
 * The scope is passed explicitly — the function runner binds it from
 * `wire.abortScope` — rather than looked up ambiently, so concurrent runs in
 * one process (or one edge isolate) can never see each other's scope and core
 * needs no `AsyncLocalStorage`.
 *
 * Entirely cooperative, and safe to call anywhere — outside a scope it is a
 * no-op, so a function does not need to know how it was invoked. A function
 * that never calls it keeps the conservative default: if it is not marked
 * `readonly`, an interrupt assumes it changed something and says so. The tool
 * that forgot to call this is exactly the one that cannot be assumed harmless.
 */
export const beginChanges = async (scope?: AbortScope): Promise<void> => {
  if (!scope) return
  if (scope.abandoned) {
    throw new AbandonedError(scope.reason)
  }
  scope.onBeginChanges?.()
}
