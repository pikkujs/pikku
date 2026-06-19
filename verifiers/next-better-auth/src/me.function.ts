import { pikkuFunc } from '#pikku/function/pikku-function-types.gen.js'

export const me = pikkuFunc({
  func: async (_services, _input, { session }) => ({
    userId: session.userId,
  }),
})
