import { pikkuSessionlessFunc } from '#pikku/function/pikku-function-types.gen.js'

export const hello = pikkuSessionlessFunc({
  func: async () => ({ message: 'Hello from Next verifier' }),
})
