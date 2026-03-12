import { cors } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '@pikku/core/http'
import type { CoreSingletonServices, CorePikkuMiddleware } from '@pikku/core'

const setSessionFromHeader: CorePikkuMiddleware = async (
  _services,
  wire,
  next
) => {
  const userId = wire.http?.request?.header('x-user-id')
  if (userId) {
    wire.setSession?.({ userId })
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

addHTTPMiddleware('*', [
  cors({ origin: true, credentials: true }),
  setSessionFromHeader,
  loadCredentials,
])
