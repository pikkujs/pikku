import type { SecretDefinitionsMeta } from '../wirings/secret/secret.types.js'
import { effectivePort, hostMatches } from '../utils/host-match.js'

/**
 * Thrown when a secret would be sent to a host its `defineSecret` declaration
 * does not list in `allowedHosts`, or, when the project requires
 * `allowedHosts`, when it lists none.
 */
export class SecretHostNotAllowedError extends Error {
  constructor(
    public readonly secretId: string,
    public readonly host: string,
    allowedHosts: string[] | undefined
  ) {
    super(
      allowedHosts?.length
        ? `Secret '${secretId}' may not be sent to '${host}' — it is declared for ${allowedHosts.map((h) => `'${h}'`).join(', ')}. Add the host to allowedHosts on its defineSecret if this is intended.`
        : `Secret '${secretId}' has no allowedHosts and this project requires one. Declare the hosts it may be sent to on its defineSecret.`
    )
    this.name = 'SecretHostNotAllowedError'
  }
}

/** Refuses a secret/host pairing the declarations do not permit. */
export const assertSecretAllowedForHost = (
  secretId: string,
  url: string | URL,
  secretDefinitions: SecretDefinitionsMeta | undefined,
  requireAllowedHosts = false
): void => {
  const parsed = typeof url === 'string' ? new URL(url) : url
  const host = parsed.hostname
  const port = effectivePort(parsed)
  const definition = Object.values(secretDefinitions ?? {}).find(
    (d) => d.secretId === secretId
  )
  const allowedHosts = definition?.allowedHosts

  if (!allowedHosts?.length) {
    if (requireAllowedHosts) {
      throw new SecretHostNotAllowedError(secretId, host, allowedHosts)
    }
    return
  }

  if (!allowedHosts.some((pattern) => hostMatches(host, port, pattern))) {
    throw new SecretHostNotAllowedError(secretId, host, allowedHosts)
  }
}
