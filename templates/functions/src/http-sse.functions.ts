import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Server-Sent Events (SSE) counter example
 *
 * @summary Streams elapsed time updates to the client every second
 * @description This function demonstrates Server-Sent Events (SSE) in Pikku using channels.
 * It requires a stream connection and sends incremental count updates every second for 5 seconds,
 * then automatically closes the connection. The counter starts at 0 and increments each second.
 * This is useful for demonstrating real-time data streaming from server to client.
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
