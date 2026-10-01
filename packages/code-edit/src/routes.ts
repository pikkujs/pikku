import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/** One page of a frontend, read from a TanStack Router file route. */
export interface AppPage {
  app: string
  path: string
  file: string
  params: string[]
}

/** Param values every app gets unless it says otherwise: the `$lang`/`$locale` convention nests whole route trees. */
export const BUILTIN_ROUTE_PARAMS: Record<string, string> = {
  lang: 'en',
  locale: 'en',
}

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.pikku',
  '.git',
  '.turbo',
  '.output',
])

const ROUTE_FILE = /\.(tsx|ts|jsx|js)$/
const ROUTE_ID = /create(Lazy)?FileRoute\(\s*(['"`])([^'"`]+)\2\s*\)/

const isPathless = (segment: string) =>
  segment.startsWith('_') || /^\(.*\)$/.test(segment)

/** The URL a TanStack route id serves: pathless `_layout` and `(group)` segments dropped, the `_` layout escape removed. */
export function routeIdToPath(id: string): string {
  const segments = id
    .split('/')
    .filter((segment) => segment && !isPathless(segment))
    .map((segment) => (segment.endsWith('_') ? segment.slice(0, -1) : segment))
  return `/${segments.join('/')}`
}

/** The param names a route path declares: `$id` → `id`, `{-$id}` → `id`, a bare `$` → `_splat`. */
export function routeParams(path: string): string[] {
  return path.split('/').flatMap((segment) => {
    const optional = /^\{-\$(.+)\}$/.exec(segment)
    if (optional) return [optional[1]!]
    if (segment === '$') return ['_splat']
    return segment.startsWith('$') ? [segment.slice(1)] : []
  })
}

/** A route path with its params filled in, or null while any segment is still dynamic. */
export function resolveRoutePath(
  path: string,
  params: Record<string, string> = {}
): string | null {
  const values = { ...BUILTIN_ROUTE_PARAMS, ...params }
  const resolved = path
    .split('/')
    .map((segment) => {
      const optional = /^\{-\$(.+)\}$/.exec(segment)
      if (optional) return values[optional[1]!] ?? ''
      const name = segment.startsWith('$') ? segment.slice(1) : null
      return name && Object.hasOwn(values, name) ? values[name]! : segment
    })
    .filter((segment, i) => i === 0 || segment)
    .join('/')
  if (/[$*{]/.test(resolved)) return null
  return resolved || '/'
}

/** The pages a browser can open as they stand, and the ones still waiting on a param value. */
export function navigablePaths(
  pages: AppPage[],
  params: Record<string, string> = {}
): { paths: string[]; skipped: AppPage[] } {
  const paths = new Set<string>()
  const skipped: AppPage[] = []
  for (const page of pages) {
    const path = resolveRoutePath(page.path, params)
    if (path === null) skipped.push(page)
    else paths.add(path)
  }
  return { paths: [...paths].sort(), skipped }
}

async function routeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('-') || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await routeFiles(path)))
    else if (
      ROUTE_FILE.test(entry.name) &&
      !/\.(gen|test|spec)\./.test(entry.name)
    )
      files.push(path)
  }
  return files
}

/** Every route a frontend's `src/routes` declares, keyed by route id; a lazy file only fills in for a missing eager one. */
async function readRoutes(routesDir: string): Promise<Map<string, string>> {
  const byId = new Map<string, { file: string; lazy: boolean }>()
  for (const file of await routeFiles(routesDir)) {
    const match = ROUTE_ID.exec(await readFile(file, 'utf-8'))
    if (!match) continue
    const id = match[3]!
    const lazy = Boolean(match[1])
    const existing = byId.get(id)
    if (!existing || (existing.lazy && !lazy)) byId.set(id, { file, lazy })
  }
  return new Map([...byId].map(([id, { file }]) => [id, file]))
}

/** The pages of one frontend: index and leaf routes, plus a layout that has no index of its own. */
export async function appPages(
  workspaceRoot: string,
  appDir: string
): Promise<AppPage[]> {
  const routes = await readRoutes(join(appDir, 'src', 'routes'))
  const ids = [...routes.keys()]
  const byPath = new Map<string, AppPage & { index: boolean }>()
  for (const [id, file] of routes) {
    const last = id.replace(/\/$/, '').split('/').pop() ?? ''
    if (last && isPathless(last) && !id.endsWith('/')) continue
    const index = id.endsWith('/')
    const layout = !index && ids.some((other) => other.startsWith(`${id}/`))
    const path = routeIdToPath(id)
    if (
      layout &&
      ids.some((other) => routeIdToPath(other) === path && other !== id)
    )
      continue
    const existing = byPath.get(path)
    if (existing && existing.index && !index) continue
    byPath.set(path, {
      app: relative(workspaceRoot, appDir) || '.',
      path,
      file: relative(workspaceRoot, file),
      params: routeParams(path),
      index,
    })
  }
  return [...byPath.values()]
    .map(({ index: _index, ...page }) => page)
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** Every directory under the workspace with a `src/routes` folder, three levels deep. */
export async function frontendDirs(workspaceRoot: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (existsSync(join(dir, 'src', 'routes'))) found.push(dir)
    if (depth === 0) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !SKIP_DIRS.has(entry.name)
      )
        await walk(join(dir, entry.name), depth - 1)
    }
  }
  await walk(workspaceRoot, 3)
  return found.sort()
}

/** Every page of every TanStack Router frontend in a workspace, read from its route files. */
export async function discoverPages(
  workspaceRoot: string,
  { apps }: { apps?: string[] } = {}
): Promise<AppPage[]> {
  const dirs = apps
    ? apps.map((app) => join(workspaceRoot, app))
    : await frontendDirs(workspaceRoot)
  const pages: AppPage[] = []
  for (const dir of dirs) {
    if (dir !== workspaceRoot && !dir.startsWith(workspaceRoot + sep))
      throw new Error('Path escapes the project')
    pages.push(...(await appPages(workspaceRoot, dir)))
  }
  return pages
}

/** The distinct route paths of a workspace, every frontend merged. */
export async function discoverRoutes(workspaceRoot: string): Promise<string[]> {
  return [
    ...new Set((await discoverPages(workspaceRoot)).map((page) => page.path)),
  ].sort()
}

/** A frontend's pages for the console: route discovery bound to one workspace. */
export class PagesService {
  constructor(private workspaceRoot: string) {}

  list(apps?: string[]): Promise<AppPage[]> {
    return discoverPages(this.workspaceRoot, apps ? { apps } : {})
  }

  routes(): Promise<string[]> {
    return discoverRoutes(this.workspaceRoot)
  }
}
