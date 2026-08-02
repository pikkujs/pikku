import type { SecretDefinitionsMeta } from '../wirings/secret/secret.types.js'

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

/** Exact match, or a single leading `*.` wildcard anchored on a dot. */
const hostMatches = (host: string, pattern: string): boolean => {
  const h = host.toLowerCase()
  const p = pattern.toLowerCase()
  if (p.startsWith('*.')) {
    return h.endsWith(p.slice(1)) && h.length > p.length - 1
  }
  return h === p
}

/** Refuses a secret/host pairing the declarations do not permit. */
export const assertSecretAllowedForHost = (
  secretId: string,
  url: string | URL,
  secretDefinitions: SecretDefinitionsMeta | undefined,
  requireAllowedHosts = false
): void => {
  const host = (typeof url === 'string' ? new URL(url) : url).hostname
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

  if (!allowedHosts.some((pattern) => hostMatches(host, pattern))) {
    throw new SecretHostNotAllowedError(secretId, host, allowedHosts)
  }
}
