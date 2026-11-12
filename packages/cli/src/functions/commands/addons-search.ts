import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { registryUrl } from '../../utils/remote-addon-sync.js'

export type AddonStatus = 'wired' | 'installed' | 'available'
/** wired/installed: the project already has one (use it, no question). exact: one clear match. several: ask. none: nothing found. */
export type SearchVerdict = 'wired' | 'installed' | 'exact' | 'several' | 'none'

export interface RegistryAddon {
  name: string
  displayName?: string
  description?: string
  tags?: string[]
  categories?: string[]
  score?: number
}

export interface AddonHit {
  name: string
  shortName: string
  displayName: string
  description: string
  tags: string[]
  firstParty: boolean
  status: AddonStatus
  score?: number
}

export interface OpenApiHit {
  name: string
  title: string
  provider: string
  description: string
  authType?: string | null
  pricingModel?: string | null
}

export interface AddonSearchResult {
  query: string
  verdict: SearchVerdict
  hits: AddonHit[]
  openapi?: OpenApiHit[]
}

const FIRST_PARTY = '@pikku/addon-'
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Names the project already depends on, and names a `wireAddon` call already points at. */
export function scanProjectAddons(root: string): {
  installed: Set<string>
  wired: Set<string>
} {
  const installed = new Set<string>()
  const wired = new Set<string>()
  const readPkg = (dir: string) => {
    const file = join(dir, 'package.json')
    if (!existsSync(file)) return
    try {
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >
      for (const key of ['dependencies', 'devDependencies', 'peerDependencies'])
        for (const name of Object.keys(pkg[key] ?? {})) installed.add(name)
    } catch {}
  }
  readPkg(root)
  const packagesDir = join(root, 'packages')
  const srcDirs: string[] = []
  if (existsSync(packagesDir))
    for (const entry of readdirSync(packagesDir)) {
      const dir = join(packagesDir, entry)
      if (!statSync(dir).isDirectory()) continue
      readPkg(dir)
      srcDirs.push(join(dir, 'src'))
    }
  srcDirs.push(join(root, 'src'))
  let budget = 2000
  const walk = (dir: string) => {
    if (budget <= 0 || !existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts') && budget-- > 0) {
        const text = readFileSync(path, 'utf8')
        if (!text.includes('wireAddon') && !text.includes('wireRemoteAddon'))
          continue
        for (const m of text.matchAll(
          /package:\s*['"]([^'"@][^'"]*|@[^'"]+)['"]/g
        ))
          wired.add(
            m[1]!.replace(/@[^@/]*$/, (v) => (v.includes('/') ? v : ''))
          )
      }
    }
  }
  for (const dir of srcDirs) walk(dir)
  return { installed, wired }
}

/** Decide what the caller should do with a ranked list. */
export function searchVerdict(query: string, hits: AddonHit[]): SearchVerdict {
  if (hits.length === 0) return 'none'
  if (hits.some((h) => h.status === 'wired')) return 'wired'
  if (hits.some((h) => h.status === 'installed')) return 'installed'
  if (hits.length === 1) return 'exact'
  const q = norm(query)
  const named = hits.find(
    (h) =>
      norm(h.shortName) === q || norm(h.displayName) === q || norm(h.name) === q
  )
  if (named && hits[0] === named) return 'exact'
  const [a, b] = hits
  if (
    a?.score != null &&
    b?.score != null &&
    b.score > 0 &&
    a.score >= 2 * b.score
  )
    return 'exact'
  return 'several'
}

export function buildHits(
  entries: RegistryAddon[],
  project: { installed: Set<string>; wired: Set<string> }
): AddonHit[] {
  return entries.map((e) => ({
    name: e.name,
    shortName: e.name.startsWith(FIRST_PARTY)
      ? e.name.slice(FIRST_PARTY.length)
      : e.name,
    displayName: e.displayName ?? e.name,
    description: (e.description ?? '').replace(/\s+/g, ' ').trim(),
    tags: e.tags ?? [],
    firstParty: e.name.startsWith(FIRST_PARTY),
    status: project.wired.has(e.name)
      ? 'wired'
      : project.installed.has(e.name)
        ? 'installed'
        : 'available',
    ...(e.score != null ? { score: e.score } : {}),
  }))
}

/** Ranked by the registry; the wired and installed ones first, then first-party, keeping the registry order within a group. */
export function orderHits(hits: AddonHit[]): AddonHit[] {
  const group = (h: AddonHit) =>
    h.status === 'wired'
      ? 0
      : h.status === 'installed'
        ? 1
        : h.firstParty
          ? 2
          : 3
  return hits
    .map((h, i) => ({ h, i }))
    .sort((x, y) => group(x.h) - group(y.h) || x.i - y.i)
    .map((x) => x.h)
}

const getJson = async <T>(url: string, what: string): Promise<T> => {
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error(
      `${what}: the registry could not be reached (${error instanceof Error ? error.message : String(error)})`
    )
  }
  if (!response.ok)
    throw new Error(
      `${what}: the registry answered ${response.status} ${(await response.text()).slice(0, 200)}`
    )
  return (await response.json()) as T
}

export const pikkuAddonsSearch = pikkuSessionlessFunc<
  { terms?: string[]; registry?: string; openapi?: boolean },
  AddonSearchResult
>({
  func: async ({ config }, input) => {
    const query = (input.terms ?? []).join(' ').trim()
    if (!query)
      throw new Error(
        'Say what you are looking for: pikku addons search <terms...>, e.g. `pikku addons search slack` or `pikku addons search send a text message`'
      )
    const registry = input.registry ?? registryUrl(config)
    const url = new URL('/registry/addons/search', registry)
    url.searchParams.set('query', query)
    const entries = await getJson<RegistryAddon[]>(
      url.toString(),
      `addons search "${query}"`
    )
    const project = scanProjectAddons(config?.rootDir ?? process.cwd())
    const hits = orderHits(
      buildHits(Array.isArray(entries) ? entries : [], project)
    ).slice(0, 8)
    const result: AddonSearchResult = {
      query,
      verdict: searchVerdict(query, hits),
      hits,
    }
    if (input.openapi) {
      const api = new URL('/registry/openapis', registry)
      api.searchParams.set('query', query)
      api.searchParams.set('accessStatus', 'public')
      api.searchParams.set('limit', '5')
      const found = await getJson<{ apis?: Array<Record<string, unknown>> }>(
        api.toString(),
        `openapi search "${query}"`
      )
      result.openapi = (found.apis ?? []).map((a) => ({
        name: String(a.name),
        title: String(a.title ?? a.name),
        provider: String(a.provider ?? ''),
        description: String(a.description ?? '')
          .replace(/\s+/g, ' ')
          .slice(0, 140),
        authType: (a.authType as string | null | undefined) ?? null,
        pricingModel: (a.pricingModel as string | null | undefined) ?? null,
      }))
    }
    return result
  },
})

const VERDICT_LINE: Record<SearchVerdict, string> = {
  wired:
    'wired: the project already uses one of these; use it, do not add another',
  installed:
    'installed: a match is already a dependency; wire it with `pikku addons add <name>` and use it',
  exact: 'exact: one clear match; add it and go',
  several:
    'several: no clear winner and none in the project; ask the user which one they use (name at most four, first-party first)',
  none: 'none: nothing matched; try a shorter or different word, or --openapi for a public API, or ask the user for the service name or an OpenAPI spec',
}

export const renderAddonsSearch = (
  _services: unknown,
  r: AddonSearchResult
): void => {
  const lines = [`Search: "${r.query}"`, `Verdict: ${VERDICT_LINE[r.verdict]}`]
  r.hits.forEach((h, i) => {
    const tags = h.tags.length ? `  tags: ${h.tags.slice(0, 5).join(', ')}` : ''
    lines.push(
      `  ${i + 1}. ${h.shortName}  [${h.status}${h.firstParty ? ', first-party' : ''}]  ${h.description.slice(0, 90)}${tags}`
    )
  })
  if (r.hits.length)
    lines.push(
      'Next: `pikku addons add <name>` installs and wires one; then `pikku meta grep <name>` lists its functions.'
    )
  if (r.openapi) {
    lines.push('OpenAPI catalogue (public, no key):')
    if (!r.openapi.length) lines.push('  none')
    for (const a of r.openapi)
      lines.push(
        `  ${a.name}  ${a.title}  [${a.authType ?? 'auth unknown'}${a.pricingModel ? `, ${a.pricingModel}` : ''}]  -> pikku addons add ${a.name} --auth none`
      )
  }
  console.log(lines.join('\n'))
}
