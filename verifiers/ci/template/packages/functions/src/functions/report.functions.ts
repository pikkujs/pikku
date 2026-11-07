import { pikkuSessionlessFunc } from '#pikku/function'

export const liveReport = pikkuSessionlessFunc<void, string>({
  func: async () => 'live',
})
