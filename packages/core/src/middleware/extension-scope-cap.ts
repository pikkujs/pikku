import { ForbiddenError } from '../errors/errors.js'
import { intersectScopes } from '../scopes.js'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'

export const EXTENSION_HEADER = 'x-pikku-extension'

/**
 * Narrows the session to what an extension is allowed to do. A call that names
 * an extension in `x-pikku-extension` keeps only the scopes both the viewer and
 * the extension's role hold, so an extension can never act beyond what it
 * declared, whoever is looking at it.
 *
 * The header is a selector, not a credential: naming an extension can only
 * reduce a session, so a caller who sends it by hand has capped themselves. An
 * extension the host does not know is refused, because ignoring it would let a
 * misspelt name run uncapped.
 *
 * Register it after the session middleware: it narrows a session that is
 * already resolved, and a call with no session has nothing to narrow.
 */
export const extensionScopeCap = pikkuMiddlewareFactory<{
  /** The scopes of the extension's role, or `undefined` when no such extension is installed. */
  resolve: (
    name: string
  ) => readonly string[] | undefined | Promise<readonly string[] | undefined>
}>(({ resolve }) =>
  pikkuMiddleware(async (_services, { http, setSession, session }, next) => {
    const name = http?.request?.header(EXTENSION_HEADER)
    if (!name || !setSession || !session) {
      return next()
    }

    const role = await resolve(name)
    if (!role) {
      throw new ForbiddenError(`Unknown extension '${name}'`)
    }

    setSession({ ...session, scopes: intersectScopes(session.scopes, role) })
    return next()
  })
)
