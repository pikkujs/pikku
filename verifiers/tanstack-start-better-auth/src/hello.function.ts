import { pikkuSessionlessFunc } from '#pikku/function/pikku-function-types.gen.js'

export const helloRPC = pikkuSessionlessFunc<{ name: string }>({
  func: async (_services, { name }) => ({
    message: `Hello ${name} from TanStack verifier`,
  }),
  expose: true,
})
