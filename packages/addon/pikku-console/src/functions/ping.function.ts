import { pikkuSessionlessFunc } from '#pikku'

export const ping = pikkuSessionlessFunc<null, { pong: true }>({
  description: 'Health check endpoint for the Pikku Console.',
  expose: true,
  auth: false,
  func: async () => {
    return { pong: true }
  },
})
