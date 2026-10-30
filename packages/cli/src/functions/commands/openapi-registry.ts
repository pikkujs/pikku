import { existsSync } from 'fs'

/** The OpenAPI catalogue entry fields `pikku new addon` and `pikku addons add` read. */
export interface OpenAPIRegistryEntry {
  name: string
  title: string
  version: string
  swaggerUrl: string
  /** api_key, oauth2, bearer, basic, none, custom or unknown. */
  authType?: string
  /** Whether each user brings their own credential rather than the app holding one. */
  perUser?: boolean
}

export type RegistryAuthMode = 'user' | 'shared' | 'none'

/**
 * Every catalogue name starts with the API provider's domain (`stripe.com`,
 * `amazonaws.com:applicationcostprofiler`); addon package names carry no dot.
 */
export const isRegistryOpenAPIName = (name: string): boolean =>
  !name.startsWith('@') && /[.:]/.test(name)

/**
 * The `--auth` an entry implies. OAuth is per user whatever `perUser` says: one
 * person's OAuth grant behind every user is never the intended setup.
 */
export function registryAuthMode(
  entry: Pick<OpenAPIRegistryEntry, 'authType' | 'perUser'>
): RegistryAuthMode {
  if (entry.authType === 'none') return 'none'
  if (entry.authType === 'oauth2' || entry.perUser) return 'user'
  if (['api_key', 'bearer', 'basic'].includes(entry.authType ?? '')) {
    return 'shared'
  }
  return 'user'
}

/**
 * The registry name `--openapi` was given, or undefined when it names a spec
 * directly: a URL, a path (anything with a separator), a file that exists, or
 * a `.json`/`.yaml`/`.yml` file that does not — a mistyped path should say
 * "no such file", not "no such API".
 */
export function openAPIRegistryName(
  source: string,
  exists: (path: string) => boolean = existsSync
): string | undefined {
  if (/^https?:\/\//i.test(source)) return undefined
  if (/[\\/]/.test(source) || /\.(json|ya?ml)$/i.test(source)) return undefined
  if (exists(source)) return undefined
  return source
}

/** Look `name` up in the registry's OpenAPI catalogue, refusing a name it does not know. */
export async function fetchOpenAPIRegistryEntry(
  registry: string,
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenAPIRegistryEntry> {
  const url = new URL(
    `/registry/openapis/${encodeURIComponent(name)}`,
    registry
  ).toString()
  let response: Response
  try {
    response = await fetchImpl(url)
  } catch (error) {
    throw new Error(
      `--openapi ${name} is not a file, and the registry at ${registry} could not be reached: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  // The registry answers an unknown name with 200 and an empty body.
  const text = response.status === 404 ? '' : await response.text()
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `--openapi ${name}: the registry at ${registry} answered ${response.status} ${text}`
    )
  }
  const entry = text ? (JSON.parse(text) as Partial<OpenAPIRegistryEntry>) : {}
  if (!entry.swaggerUrl) {
    throw new Error(
      `--openapi ${name} is not a file, and the registry at ${registry} has no OpenAPI by that name. Pass a path or URL to a spec, or a name from https://www.pikku.dev/openapis such as amazonaws.com:applicationcostprofiler`
    )
  }
  return entry as OpenAPIRegistryEntry
}
