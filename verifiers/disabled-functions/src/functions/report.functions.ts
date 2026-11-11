import { pikkuSessionlessFunc } from '#pikku/function'

/** Wired below, so it is used. */
export const liveReport = pikkuSessionlessFunc<void, string>({
  func: async () => 'live',
})

/**
 * Nothing calls it any more. `disabled` leaves it out of every generated
 * file, and anything that still referenced it would fail the build.
 */
export const oldReport = pikkuSessionlessFunc<void, string>({
  disabled: 'replaced by liveReport',
  expose: true,
  func: async () => 'old',
})
