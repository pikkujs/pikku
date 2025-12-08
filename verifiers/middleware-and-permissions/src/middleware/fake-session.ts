import { pikkuMiddleware, addMiddleware } from '#pikku'

/**
 * Session tag middleware that sets a fake session for testing.
 *
 * Uses userSession.set() to establish a test user session that will be
 * available to permissions and subsequent middleware/functions.
 *
 * Note: userSession is only available in HTTP/Channel contexts.
 * For queue/scheduler/CLI/MCP, sessions come from the createWireServices factory.
 */
export const fakeSessionMiddleware = pikkuMiddleware(
  async ({ logger }, { session }, next) => {
    logger.info({ type: 'tag', name: 'session', phase: 'before' })

    // Set a fake session for testing - only available in HTTP/Channel contexts
    if (session) {
      await session.set({ userId: 'test-user-123' })
    }

    const result = await next()
    logger.info({ type: 'tag', name: 'session', phase: 'after' })
    return result
  }
)

/**
 * Tag middleware factory for session - applies to all wirings with 'session' tag
 */
export const sessionTagMiddleware = () =>
  addMiddleware('session', [fakeSessionMiddleware])
