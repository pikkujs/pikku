import { addRoute } from '@pikku/core'
import { APIFunctionSessionless } from '../.pikku/pikku-types.gen.js'

export const timeSinceOpened: APIFunctionSessionless<
  void,
  { count: number } | void
> = async (services) => {
  const startedAt = Date.now()
  let count = 0
  const interval = setInterval(() => {
    services?.channel?.send({ count: count++ })
    if (Date.now() - startedAt > 5000) {
      clearInterval(interval)
      services?.channel?.close()
    }
  }, 1000)

  return { count }
}

addRoute({
  auth: false,
  method: 'get',
  route: '/sse',
  func: timeSinceOpened,
  sse: true,
})
