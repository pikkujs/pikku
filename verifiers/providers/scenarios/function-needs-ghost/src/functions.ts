import { pikkuSessionlessFunc } from '#pikku/function'

export const useNeeds = pikkuSessionlessFunc<void, string>({
  auth: false,
  func: async ({ ghost }) => String(ghost),
})
