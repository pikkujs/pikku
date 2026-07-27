/**
 * A local stand-in for the Fabric addon registry.
 *
 * The console's addon gallery reads its catalogue from
 * `${FABRIC_API_URL}/registry/packages`, which in production is
 * api.pikkufabric.com. Pointing the e2e suite at that means the addons
 * scenarios assert against a catalogue that changes without anybody touching
 * this repo — a package renamed upstream turns them red, and they cannot run at
 * all without a network. So the suite serves its own catalogue from a
 * checked-in fixture and asserts against exactly what it checked in.
 *
 * The fixture holds only what distinguishes one package from another. Every
 * addon also carries a large set of structural fields (its functions, agents,
 * secrets, HTTP routes, …) which the gallery renders as counts and which are
 * empty for all of these; filling them in here keeps the fixture readable
 * rather than 90% braces.
 */
import { createServer, type Server } from 'http'
import { readFileSync } from 'fs'

const REGISTRY_PORT = Number(process.env.MOCK_REGISTRY_PORT ?? 4096)

export const mockRegistryUrl = `http://localhost:${REGISTRY_PORT}`

interface RegistryFixtureEntry {
  name: string
  displayName: string
  description: string
  categories: string[]
  tags: string[]
  functionCount: number
  /**
   * `latest` marks a package that really is published, so installing it from
   * the gallery reaches npm and succeeds. Most of the catalogue is invented —
   * it exists to be browsed, searched and counted — and keeps the placeholder
   * version, which is what makes an accidental install of one fail loudly
   * rather than silently pull something unrelated.
   */
  version?: string
}

const fixture: RegistryFixtureEntry[] = JSON.parse(
  readFileSync(new URL('./fixtures/registry-packages.json', import.meta.url), {
    encoding: 'utf-8',
  })
)

/**
 * The gallery shows a function count per card, so the fixture's `functionCount`
 * has to become that many entries rather than a number — the console counts the
 * keys it is given.
 */
const functionsFor = (entry: RegistryFixtureEntry) =>
  Object.fromEntries(
    Array.from({ length: entry.functionCount }, (_, index) => [
      `${entry.name}/fn${index}`,
      { name: `fn${index}` },
    ])
  )

const PUBLISHED_AT = '2026-01-01T00:00:00.000Z'

const toRegistryPackage = (entry: RegistryFixtureEntry) => ({
  id: entry.name,
  name: entry.name,
  displayName: entry.displayName,
  version: entry.version ?? '1.0.0',
  description: entry.description,
  author: 'pikku',
  license: 'MIT',
  publishedAt: PUBLISHED_AT,
  updatedAt: PUBLISHED_AT,
  tags: entry.tags,
  categories: entry.categories,
  functions: functionsFor(entry),
  agents: {},
  secrets: {},
  credentials: {},
  variables: {},
  httpRoutes: {},
  channels: {},
  cli: {},
  mcp: null,
  schemas: {},
})

const packages = fixture.map(toRegistryPackage)

const matchesSearch = (pkg: (typeof packages)[number], query: string) => {
  const needle = query.toLowerCase()
  return (
    pkg.name.toLowerCase().includes(needle) ||
    pkg.displayName.toLowerCase().includes(needle) ||
    pkg.description.toLowerCase().includes(needle) ||
    pkg.tags.some((tag) => tag.toLowerCase().includes(needle))
  )
}

const selectPackages = (params: URLSearchParams) => {
  const names = params.get('names')
  // Sent even when empty, and an empty list means "nothing installed" — it must
  // return nothing rather than falling back to the whole catalogue.
  if (names != null) {
    const wanted = new Set(names.split(',').filter(Boolean))
    return packages.filter((pkg) => wanted.has(pkg.name))
  }

  let rows = packages
  const query = params.get('query')
  if (query) rows = rows.filter((pkg) => matchesSearch(pkg, query))
  const category = params.get('category')
  if (category) rows = rows.filter((pkg) => pkg.categories.includes(category))
  if (params.get('official') === 'true') {
    rows = rows.filter((pkg) => pkg.name.startsWith('@pikku/'))
  }

  const sort = params.get('sort')
  if (sort === 'functions') {
    rows = [...rows].sort(
      (a, b) =>
        Object.keys(b.functions).length - Object.keys(a.functions).length
    )
  } else if (sort === 'agents') {
    rows = [...rows].sort(
      (a, b) => Object.keys(b.agents).length - Object.keys(a.agents).length
    )
  } else {
    rows = [...rows].sort((a, b) => a.name.localeCompare(b.name))
  }
  return rows
}

let server: Server | undefined

export function startMockRegistryServer(): Promise<Server> {
  if (server) {
    return Promise.resolve(server)
  }
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      const url = new URL(req.url!, mockRegistryUrl)
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      }

      if (url.pathname === '/registry/packages/categories') {
        const counts: Record<string, number> = {}
        for (const pkg of packages) {
          for (const category of pkg.categories) {
            counts[category] = (counts[category] ?? 0) + 1
          }
        }
        json(200, counts)
        return
      }

      if (url.pathname === '/registry/packages') {
        const rows = selectPackages(url.searchParams)
        const cursor = Number(url.searchParams.get('cursor') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 50)
        const page = rows.slice(cursor, cursor + limit)
        const nextCursor = cursor + limit < rows.length ? cursor + limit : null
        json(200, { packages: page, total: rows.length, nextCursor })
        return
      }

      if (url.pathname.startsWith('/registry/packages/')) {
        const id = decodeURIComponent(
          url.pathname.slice('/registry/packages/'.length)
        )
        const pkg = packages.find((candidate) => candidate.id === id)
        if (!pkg) {
          json(404, { error: 'not found' })
          return
        }
        json(200, pkg)
        return
      }

      json(404, { error: 'not found' })
    })

    s.once('error', reject)
    s.listen(REGISTRY_PORT, () => {
      server = s
      resolve(s)
    })
  })
}

export function stopMockRegistryServer(): void {
  server?.close()
  server = undefined
}
