import { pikkuAuth } from '#pikku/auth'
import { pikkuMiddleware } from '#pikku/middleware'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

/**
 * The `bare` and `full` scenarios of benchmarks/bench-shared.ts with the same function bodies: one `logger.info` line per request,
 * `bare` returns `{ ok: true }`, `full` echoes `data.name`, runs the session middleware twice and an always-allow permission.
 */
const logLine = (logger: { info: (m: string) => void }) =>
  logger.info('request handled')

const sessionMiddleware = pikkuMiddleware(
  async (_services, { setSession }, next) => {
    await setSession?.({ userId: 'bench-user' } as any)
    await next()
  }
)

const alwaysAllow = pikkuAuth({ func: async () => true })

export const bare = pikkuSessionlessFunc<void, { ok: true }>({
  func: async ({ logger }) => {
    logLine(logger)
    return { ok: true }
  },
})

export const full = pikkuFunc<{ name: string }, { echo: string }>({
  func: async ({ logger }, data) => {
    logLine(logger)
    return { echo: data.name }
  },
  middleware: [sessionMiddleware, sessionMiddleware],
  permissions: { canAccess: alwaysAllow },
})

wireHTTP({ route: '/bare', method: 'get', auth: false, func: bare })
wireHTTP({ route: '/full', method: 'post', func: full })
