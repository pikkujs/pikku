import { timingSafeEqual } from 'node:crypto'
import { addGlobalMiddleware, pikkuMiddleware } from '@pikku/core/middleware'
import { pikkuState } from '@pikku/core/state'

export const STUDIO_HEADER = 'x-pikku-studio'

export const STUDIO_SESSION = {
  userId: 'studio',
  scopes: ['admin', 'pikku:otlp:runs'],
}

/**
 * The root of every scope the functions of a wired addon require, so the Studio
 * session can use the addons the project wires. Never the wildcard.
 */
const wiredAddonScopeRoots = () => {
  const roots = new Set<string>()
  for (const addon of pikkuState(null, 'addons', 'packages').values()) {
    if (addon.remote) continue
    const meta = pikkuState(addon.package, 'function', 'meta')
    for (const { scopes } of Object.values(meta)) {
      for (const scope of scopes ?? []) {
        const root = scope.split(':')[0]
        if (root && root !== '*') roots.add(root)
      }
    }
  }
  return roots
}

/**
 * `crud` when the project has CRUD collections: only the functions `pikku all`
 * generates from `db/crud.ts` require a scope under that root.
 */
const crudScopeRoots = () =>
  Object.values(pikkuState(null, 'function', 'meta')).some(({ scopes }) =>
    scopes?.some((scope) => scope.startsWith('crud:'))
  )
    ? ['crud']
    : []

const matches = (presented: string, token: string) => {
  const a = Buffer.from(presented)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const studioSession = (token: string) =>
  pikkuMiddleware(
    async (_services, { http, session, setInitialSession }, next) => {
      const presented = http?.request?.header(STUDIO_HEADER)
      if (
        !session &&
        setInitialSession &&
        typeof presented === 'string' &&
        matches(presented, token)
      ) {
        setInitialSession({
          ...STUDIO_SESSION,
          scopes: [
            ...new Set([
              ...STUDIO_SESSION.scopes,
              ...wiredAddonScopeRoots(),
              ...crudScopeRoots(),
            ]),
          ],
        })
      }
      return next()
    }
  )

export const registerStudioSession = (
  token: string | undefined = process.env.PIKKU_STUDIO_TOKEN
) => {
  if (!token || token.length < 32) return false
  addGlobalMiddleware([studioSession(token)])
  return true
}
