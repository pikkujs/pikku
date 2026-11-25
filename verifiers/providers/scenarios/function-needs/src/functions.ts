import { pikkuSessionlessFunc } from '#pikku/function'

export const useNeeds = pikkuSessionlessFunc<void, string>({
  auth: false,
  func: async ({ probe }) => String(probe),
})
