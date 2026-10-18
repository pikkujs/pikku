import { pikkuSessionlessFunc } from '#pikku/function'

export const ping = pikkuSessionlessFunc<void, string>({
  auth: false,
  func: async () => 'pong',
})
