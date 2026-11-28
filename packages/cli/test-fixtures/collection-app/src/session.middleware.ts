import { addHTTPMiddleware, pikkuMiddleware } from '#pikku/middleware'

/**
 * Test only: the header names the caller. `x-test-cached` replays an earlier
 * grant, as a session cache would.
 */
const testSession = pikkuMiddleware(
  async ({ scopeService }, { http, setInitialSession }, next) => {
    const userId = http?.request?.header('x-test-user')
    if (userId && setInitialSession) {
      const cached = http?.request?.header('x-test-cached')
      setInitialSession({
        userId,
        scopes: cached
          ? cached.split(',')
          : await scopeService!.resolveScopes(userId),
        scopesResolvedAt: Date.now(),
      })
    }
    return next()
  }
)

addHTTPMiddleware('*', [testSession])
