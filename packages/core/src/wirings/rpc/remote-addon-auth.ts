import type { CoreServices, PikkuRawWire } from '../../types/core.types.js'
import { PikkuError, addError } from '../../errors/error-handler.js'

export type RemoteAddonAuthBinding =
  | { credentialId: string }
  | { secretId: string }
  | {
      resolve: (
        services: CoreServices,
        wire: PikkuRawWire
      ) => string | Promise<string>
    }

export class RemoteAddonAuthError extends PikkuError {
  public readonly namespace: string
  constructor(namespace: string, detail: string) {
    super(`Remote addon '${namespace}' auth could not be resolved: ${detail}`)
    this.namespace = namespace
  }
}
addError(RemoteAddonAuthError, {
  status: 401,
  message: 'Remote addon authentication could not be resolved.',
})

/** Returns `null` only when no auth is bound; an empty resolved token throws. */
export async function resolveRemoteAddonToken(
  auth: RemoteAddonAuthBinding | undefined,
  services: CoreServices,
  wire: PikkuRawWire,
  namespace: string
): Promise<string | null> {
  if (!auth) {
    return null
  }

  let token: unknown
  if ('credentialId' in auth) {
    if (typeof wire.getCredential !== 'function') {
      throw new RemoteAddonAuthError(
        namespace,
        `credentialId '${auth.credentialId}' requires a wire with credential access`
      )
    }
    token = await wire.getCredential(auth.credentialId)
  } else if ('secretId' in auth) {
    token = await services.secrets.getSecret(auth.secretId)
  } else if (typeof auth.resolve === 'function') {
    token = await auth.resolve(services, wire)
  }

  if (token === null || token === undefined || token === '') {
    throw new RemoteAddonAuthError(namespace, 'resolved token was empty')
  }

  return String(token)
}
