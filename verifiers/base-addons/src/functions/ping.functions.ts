import { pikkuSessionlessFunc } from '#pikku/function'

export const ping = pikkuSessionlessFunc<void, { pong: true }>({
  expose: true,
  auth: false,
  func: async () => ({ pong: true }),
})
