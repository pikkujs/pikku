import { cors } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '@pikku/core/http'
import { pikkuMiddleware } from '@pikku/core'
import type { CoreSingletonServices, CorePikkuMiddleware } from '@pikku/core'
import { betterAuthSession } from '@pikku/better-auth'
// Registers the console addon's admin gate (a global permission). Imported here
// so it runs at bootstrap alongside the global middleware registrations.
import './console-authz.js'

const setSessionFromHeader: CorePikkuMiddleware = async (
  _services,
  wire,
  next
) => {
  const userId = wire.http?.request?.header('x-user-id')
  // `x-org-id` makes org-scoped agents reachable: nothing else in this harness
  // populates `session.orgId`, and an agent declaring `sessionScope: 'org'`
  // fails closed without one, so its success path would be untestable.
  const orgId = wire.http?.request?.header('x-org-id')
  if (userId || orgId) {
    wire.setSession?.({
      ...(userId ? { userId } : {}),
      ...(orgId ? { orgId } : {}),
    })
  }
  await next()
}

const loadCredentials: CorePikkuMiddleware = async (services, wire, next) => {
  const credentialService = (services as CoreSingletonServices)
    .credentialService
  if (credentialService) {
    const userId = wire.http?.request?.header('x-user-id')
    const credentialNames = wire.http?.request?.header('x-credentials')
    if (credentialNames) {
      for (const name of credentialNames.split(',')) {
        const cred = await credentialService.get(
          name.trim(),
          userId || undefined
        )
        if (cred) {
          wire.setCredential?.(name.trim(), cred)
        }
      }
    }
  }
  await next()
}

/**
 * Must run before the generated `betterAuthSession()`, which is registered on
 * the same `'*'` pattern from the scaffold's own file: whichever runs first
 * sets the session and the other then skips, so if the plain one wins the
 * impersonation header is never read and a scoped caller keeps running as
 * itself.
 *
 * The priority is what orders them. Import order is not a contract across two
 * files — which one the generated bootstrap imports first is codegen's
 * business, and this only ever appeared to work because a group keyed by
 * pattern used to hold one registration and the second silently displaced the
 * first. `cors` is lifted with it so the group keeps its own written order.
 */
const impersonationSession = pikkuMiddleware({
  name: 'impersonation-session',
  priority: 'high',
  func: betterAuthSession({
    impersonation: {
      loadUser: (userId, services) =>
        (services as CoreSingletonServices & { kysely: any }).kysely
          .selectFrom('user')
          .where('id', '=', userId)
          .select(['id'])
          .executeTakeFirst(),
    },
  }),
})

addHTTPMiddleware('*', [
  pikkuMiddleware({
    name: 'cors',
    priority: 'high',
    func: cors({ origin: true, credentials: true }),
  }),
  impersonationSession,
  setSessionFromHeader,
  loadCredentials,
])
