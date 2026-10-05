import { existsSync, readdirSync } from 'node:fs'
import { basename, isAbsolute, join, relative, sep } from 'node:path'

export type BrandFrontend = { name: string; dir: string; primary: boolean }

export type FrontendConfig = Record<string, { cwd: string; primary?: boolean }>

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.pikku', '.output', '.tanstack'])
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']

const isFrontendDir = (dir: string) =>
  VITE_CONFIGS.some((f) => existsSync(join(dir, f))) || existsSync(join(dir, 'index.html'))

function scan(dir: string, depth: number, out: string[]): void {
  if (depth > 0 && isFrontendDir(dir)) {
    out.push(dir)
    return
  }
  if (depth >= 3) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    scan(join(dir, entry.name), depth + 1, out)
  }
}

/** The configured frontends, else every directory under the workspace holding a vite config or an index.html. */
export function findFrontends(workspaceRoot: string, configured?: FrontendConfig): BrandFrontend[] {
  if (configured && Object.keys(configured).length) {
    return Object.entries(configured).map(([name, f]) => ({
      name,
      dir: isAbsolute(f.cwd) ? f.cwd : join(workspaceRoot, f.cwd),
      primary: !!f.primary,
    }))
  }
  const dirs: string[] = []
  scan(workspaceRoot, 0, dirs)
  return dirs.sort().map((dir) => ({
    name: relative(workspaceRoot, dir).split(sep).join('/'),
    dir,
    primary: false,
  }))
}

/** The frontend named by path or basename; with no name, the primary or the only one. */
export function pickFrontend(frontends: BrandFrontend[], name?: string): BrandFrontend {
  if (name) {
    const hit = frontends.find((f) => f.name === name || basename(f.dir) === name)
    if (!hit) {
      throw new Error(`No frontend "${name}". Available: ${frontends.map((f) => f.name).join(', ') || 'none'}`)
    }
    return hit
  }
  const primary = frontends.find((f) => f.primary)
  if (primary) return primary
  if (frontends.length === 1) return frontends[0]!
  throw new Error(
    frontends.length
      ? `Several frontends (${frontends.map((f) => f.name).join(', ')}); pass --app`
      : 'No frontend found: no directory under the workspace has a vite config or an index.html'
  )
}
