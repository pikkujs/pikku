import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * @summary Server-sent events counter
 * @description Streams incrementing counter every second for 5 seconds via SSE channel, then closes connection
 */
export const timeSinceOpened = pikkuSessionlessFunc<
  void,
  { count: number } | void
>(async ({ channel }) => {
  if (!channel) {
    throw new Error('This function requires a stream.')
  }
  const startedAt = Date.now()
  let count = 0
  const interval = setInterval(() => {
    channel.send({ count: count++ })
    if (Date.now() - startedAt > 5000) {
      clearInterval(interval)
      channel.close()
    }
  }, 1000)

  return { count }
})
