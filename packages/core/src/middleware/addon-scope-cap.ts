import { ForbiddenError } from '../errors/errors.js'
import { intersectScopes } from '../scopes.js'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'

export const ADDON_HEADER = 'x-pikku-addon'

/**
 * Narrows the session to what an addon is allowed to do. A call that names an
 * addon in `x-pikku-addon` keeps only the scopes both the viewer and the
 * addon's role hold, so an addon's screens can never act beyond what it
 * declared, whoever is looking at them.
 *
 * The header is a selector, not a credential: naming an addon can only
 * reduce a session, so a caller who sends it by hand has capped themselves. An
 * addon the host does not know is refused, because ignoring it would let a
 * misspelt name run uncapped.
 *
 * Register it after the session middleware: it narrows a session that is
 * already resolved, and a call with no session has nothing to narrow.
 */
export const addonScopeCap = pikkuMiddlewareFactory<{
  /** The scopes of the addon's role, or `undefined` when no such addon is installed. */
  resolve: (
    name: string
  ) => readonly string[] | undefined | Promise<readonly string[] | undefined>
}>(({ resolve }) =>
  pikkuMiddleware(async (_services, { http, setSession, session }, next) => {
    const name = http?.request?.header(ADDON_HEADER)
    if (!name || !setSession || !session) {
      return next()
    }

    const role = await resolve(name)
    if (!role) {
      throw new ForbiddenError(`Unknown addon '${name}'`)
    }

    setSession({ ...session, scopes: intersectScopes(session.scopes, role) })
    return next()
  })
)
