import { z } from 'zod'

/**
 * Read-only client for the Fabric community registry.
 *
 * Every route here is a public GET on the Fabric API, so none of it takes a
 * token — discovery works before `pikku fabric login`, which is the point: the
 * question "is there already an addon for this?" comes up while deciding
 * whether to adopt Fabric at all. Publishing and installing are the
 * authenticated half and live in their own commands.
 */

/** One published community package — an addon that is already built and typed. */
export const PackageEntrySchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  displayName: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})
export type PackageEntry = z.infer<typeof PackageEntrySchema>

/** One OpenAPI catalogue entry — a spec an addon can be generated FROM. */
export const OpenApiEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  provider: z.string(),
  service: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  swaggerUrl: z.string(),
  categories: z.array(z.string()).optional(),
  preferred: z.boolean().optional(),
  totalOperations: z.number().optional(),
  authTypes: z.array(z.string()).optional(),
})
export type OpenApiEntry = z.infer<typeof OpenApiEntrySchema>

async function get<T>(apiUrl: string, path: string): Promise<T | null> {
  const response = await fetch(new URL(path, apiUrl))
  // A 404 is an answer, not a failure: "nothing by that name" is exactly what
  // the caller asked, and throwing would make it indistinguishable from the
  // registry being down.
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      `Registry GET ${path} failed: ${response.status} ${await response.text()}`
    )
  }
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : null
}

/** Search published community packages (installable with `pikku fabric addon add`). */
export async function searchPackages(
  apiUrl: string,
  query: string
): Promise<PackageEntry[]> {
  const params = new URLSearchParams({ query })
  return (
    (await get<PackageEntry[]>(
      apiUrl,
      `/registry/addons/search?${params.toString()}`
    )) ?? []
  )
}

/** Search the OpenAPI catalogue (specs to generate an addon from). */
export async function searchOpenApis(
  apiUrl: string,
  query: string,
  limit = 20
): Promise<OpenApiEntry[]> {
  const params = new URLSearchParams({ limit: String(limit), offset: '0' })
  if (query) params.set('query', query)
  const result = await get<{ apis: OpenApiEntry[] }>(
    apiUrl,
    `/registry/openapis?${params.toString()}`
  )
  return result?.apis ?? []
}

/**
 * Normalise every spelling of an addon to the registry id.
 *
 * The catalogue keys on `pikku-addon-<bare>`, but `gmail`, `addon-gmail` and
 * `@pikku/addon-gmail` all name the same thing and all three appear in the
 * wild — including in what the search itself printed. Answering "no such
 * entry" to a name this tool just displayed is how a caller spends three
 * lookups learning nothing.
 */
export function registryId(name: string): string | null {
  const bare = name
    .replace(/^@pikku\//, '')
    .replace(/^(pikku-)?addon-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
  return bare ? `pikku-addon-${bare}` : null
}

/** One published addon, by any of its spellings. */
export async function getPackage(
  apiUrl: string,
  name: string
): Promise<PackageEntry | null> {
  const id = registryId(name)
  if (!id) return null
  return get<PackageEntry>(apiUrl, `/registry/addons/${encodeURIComponent(id)}`)
}

/** One OpenAPI entry by name — carries the `swaggerUrl` to generate from. */
export async function getOpenApi(
  apiUrl: string,
  name: string
): Promise<OpenApiEntry | null> {
  return get<OpenApiEntry>(
    apiUrl,
    `/registry/openapis/${encodeURIComponent(name)}`
  )
}
