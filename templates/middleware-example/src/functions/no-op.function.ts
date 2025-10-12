import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

export const noOpFunction = pikkuSessionlessFunc(
  async ({ middlewareChecker }) => {
    middlewareChecker.log({ type: 'function', name: 'noOp', phase: 'execute' })
    return { success: true }
  }
)
