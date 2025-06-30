import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const timeSinceOpened = pikkuSessionlessFunc<
  void,
  { count: number } | void
>(async () => {
  // const startedAt = Date.now()
  let count = 0
  // const interval = setInterval(() => {
  //   services?.channel?.send({ count: count++ })
  //   if (Date.now() - startedAt > 5000) {
  //     clearInterval(interval)
  //     services?.channel?.close()
  //   }
  // }, 1000)

  return { count }
})
