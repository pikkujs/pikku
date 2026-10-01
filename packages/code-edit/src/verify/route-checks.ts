import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE_FILE = /\.tsx$/
const LOCAL_IMPORT = /from\s+['"]@\/([^'"]+)['"]/g
const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts']
const DATA_CALL =
  /\busePikkuQuery\b|\busePikkuInfiniteQuery\b|\busePikkuMutation\b|\busePikkuSubscription\b|\bpikkuFetch\b|\brpc\.invoke\b|\bloader\s*:/

const read = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

const routeFiles = (routesDir: string): string[] => {
  if (!existsSync(routesDir)) return []
  try {
    return readdirSync(routesDir).filter((f) => ROUTE_FILE.test(f))
  } catch {
    return []
  }
}

/** A flat route file's source plus the `@/` modules it imports, one level deep, so a two-line route shim is judged by its page component. */
export function routeSources(routesDir: string, file: string): string[] {
  const own = read(join(routesDir, file))
  if (own === null) return []
  const sources = [own]
  const src = join(routesDir, '..')
  for (const match of own.matchAll(LOCAL_IMPORT)) {
    for (const ext of EXTS) {
      const imported = read(join(src, `${match[1]}${ext}`))
      if (imported !== null) {
        sources.push(imported)
        break
      }
    }
  }
  return sources
}

export type OrphanedChildRoute = { parent: string; children: string[] }

const drawsOutlet = (source: string): boolean =>
  source.includes('<Outlet') || source.includes('Outlet()')

/** Flat TanStack parent routes that never render an `<Outlet />`, so every child route under them mounts nowhere. */
export function orphanedChildRoutes(routesDir: string): OrphanedChildRoute[] {
  const files = routeFiles(routesDir)
  const orphans: OrphanedChildRoute[] = []
  for (const parent of files) {
    const stem = parent.replace(ROUTE_FILE, '')
    const children = files.filter(
      (f) => f !== parent && f.startsWith(`${stem}.`)
    )
    if (children.length === 0) continue
    const sources = routeSources(routesDir, parent)
    if (sources.length === 0 || sources.some(drawsOutlet)) continue
    orphans.push({ parent, children })
  }
  return orphans
}

/** Parameterised (`$param`) routes whose component tree makes no data call, so cannot be showing the record they exist for. */
export function datalessDetailRoutes(routesDir: string): string[] {
  return routeFiles(routesDir)
    .filter((f) => f.includes('$'))
    .filter((file) => {
      const sources = routeSources(routesDir, file)
      if (sources.length === 0) return false
      return !sources.some((source) => DATA_CALL.test(source))
    })
}
