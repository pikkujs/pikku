import { pikkuSessionlessFunc } from '#pikku/function'

export const shout = pikkuSessionlessFunc<{ text: string }, { text: string }>({
  expose: true,
  auth: false,
  func: async (_services, { text }) => ({ text: text.toUpperCase() }),
})
