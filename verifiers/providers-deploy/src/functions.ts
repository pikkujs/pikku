import { pikkuSessionlessFunc } from '#pikku/function'

export const usesDb = pikkuSessionlessFunc<void, string>({
  auth: false,
  func: async ({ kysely }) => String(kysely),
})
export const usesAi = pikkuSessionlessFunc<void, string>({
  auth: false,
  func: async ({ aiProviders }) => String(aiProviders),
})
export const plain = pikkuSessionlessFunc<void, string>({
  auth: false,
  func: async () => 'plain',
})
export const serverJob = pikkuSessionlessFunc<void, string>({
  auth: false,
  deploy: 'server',
  func: async ({ kysely }) => String(kysely),
})
