import { pikkuFunc } from '#pikku'

export const ping = pikkuFunc<null, { pong: true }>({
  title: 'Ping',
  description: 'Health check endpoint for the Pikku Console.',
  expose: true,
  func: async () => {
    return { pong: true }
  },
})
