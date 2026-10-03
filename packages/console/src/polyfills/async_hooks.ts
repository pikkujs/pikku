/**
 * A browser stand-in for `node:async_hooks`.
 *
 * `@pikku/core` re-exports its abort scope from the package root, and that
 * module constructs an `AsyncLocalStorage` at import time. Vite externalises
 * `node:async_hooks`, so importing anything at all from `@pikku/core` used to
 * take the whole console down with "AsyncLocalStorage is not a constructor"
 * before a single component mounted.
 *
 * A single mutable slot is the honest implementation here rather than a
 * shortcut: the browser has one task at a time and no way to observe async
 * context, so there is nothing per-context to keep apart. The console never
 * reads an abort scope anyway — it is a caller, not a callee — so this exists
 * to make the import survive, not to carry a value.
 */
export class AsyncLocalStorage<T> {
  #store: T | undefined

  run<R>(store: T, fn: () => R): R {
    const previous = this.#store
    this.#store = store
    try {
      return fn()
    } finally {
      this.#store = previous
    }
  }

  getStore(): T | undefined {
    return this.#store
  }

  enterWith(store: T): void {
    this.#store = store
  }

  exit<R>(fn: () => R): R {
    return this.run(undefined as T, fn)
  }
}

export default { AsyncLocalStorage }
