import { cors } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '@pikku/core/http'
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

// Registered before the generated betterAuthSession (import order) so the
// impersonation overlay wins; the generated one then skips (session already set).
const impersonationSession = betterAuthSession({
  impersonation: {
    loadUser: (userId, services) =>
      (services as CoreSingletonServices & { kysely: any }).kysely
        .selectFrom('user')
        .where('id', '=', userId)
        .select(['id'])
        .executeTakeFirst(),
  },
})

addHTTPMiddleware('*', [
  cors({ origin: true, credentials: true }),
  impersonationSession,
  setSessionFromHeader,
  loadCredentials,
])
