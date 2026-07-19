import type { CoreServices, PikkuRawWire } from '../../types/core.types.js'
import { PikkuError, addError } from '../../errors/error-handler.js'

/**
 * How a `wireRemoteAddon` consumer supplies the token the hosted addon expects.
 * This is a CLIENT authenticating to a hosted library — not the trusted mesh.
 */
export type RemoteAddonAuthBinding =
  | { credentialId: string }
  | { secretId: string }
  | {
      resolve: (
        services: CoreServices,
        wire: PikkuRawWire
      ) => string | Promise<string>
    }

/** The addon's auth was bound but the source produced no token — fail closed. */
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

/**
 * Resolve the bearer token for a remote addon call from the consumer's bound
 * source. Returns `null` only when no auth is bound (a public surface).
 *
 * Security: the resolved token is never logged or traced; per-user credentials
 * are read via the wire (scoped to `pikkuUserId`); an empty result fails closed.
 */
export async function resolveRemoteAddonToken(
  auth: RemoteAddonAuthBinding | undefined,
  services: CoreServices,
  wire: PikkuRawWire,
  namespace: string
): Promise<string | null> {
  if (!auth) {
    // No auth bound → the addon declares its remote surface public.
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
