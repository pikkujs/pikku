import { pikkuSessionlessFunc } from '#pikku/function'

/**
 * What a run is allowed to see in its catalogue. The run test serves it from a
 * plain HTTP server in front of better-auth, so it has no body of its own.
 */
export const whoAmI = pikkuSessionlessFunc({
  expose: true,
  title: 'Who am I',
  description: 'The signed-in user, as the app sees it.',
  func: async () => ({}),
})
