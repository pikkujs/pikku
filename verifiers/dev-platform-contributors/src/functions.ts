import { pikkuSessionlessFunc } from '#pikku/function'

export const ping = pikkuSessionlessFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  auth: false,
  func: async () => 'pong',
})
