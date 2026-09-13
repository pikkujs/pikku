import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'

/**
 * Every flag below is declared in flags.ts, so these compile.
 *
 * `expose` is what registers a function with the runner here — nothing wires
 * these to HTTP, and an unwired function is not registered at all, so
 * `runPikkuFunc` would report it missing rather than run the gate under test.
 */

export const openSandbox = pikkuFunc<void, string>({
  expose: true,
  featureFlag: 'sandboxes',
  scopes: ['sandboxes:read'],
  func: async () => 'sandbox',
})

/** A flag with no scopes of its own: the switch is the whole answer. */
export const unscopedSandbox = pikkuFunc<void, string>({
  expose: true,
  featureFlag: 'sandboxes',
  func: async () => 'sandbox',
})

/**
 * The kill switch on background work. A sessionless function keeps
 * `featureFlag` even though it has no `scopes`, which is the point: nobody is
 * watching a cron task's UI to notice the feature is off.
 */
export const nightlyReindex = pikkuSessionlessFunc<void, string>({
  expose: true,
  featureFlag: 'nightlyReindex',
  func: async () => 'reindexed',
})

/** No flag at all is still valid — the gate is opt-in. */
export const unflagged = pikkuFunc<void, string>({
  expose: true,
  func: async () => 'open',
})
