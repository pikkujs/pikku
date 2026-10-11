import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { findWorkspaceRoot } from '../workspace-root.js'

export type VerifyFrontend = { name: string; dir: string }

export type VerifyProject = {
  rootDir: string
  workspaceRoot: string
  outDir: string
  srcDirectories: string[]
  tsconfig: string
  frontends: VerifyFrontend[]
  /** Workspace-relative path prefixes the i18n checks (jsx-literal-text, jsx-literal-prop, as-i18n-argument) skip. From `i18n.ignore` in pikku.config.json. */
  i18nIgnore: string[]
}

type PikkuConfigFile = {
  outDir?: string
  srcDirectories?: string[]
  tsconfig?: string
  frontends?: Record<string, { cwd?: string; deploy?: boolean }>
  i18n?: { ignore?: string[] }
}

/** The nearest directory at or above `startDir` holding a pikku.config.json, else null. */
export function findPikkuRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  while (true) {
    if (existsSync(join(dir, 'pikku.config.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const readConfig = (rootDir: string): PikkuConfigFile => {
  const raw = readFileSync(join(rootDir, 'pikku.config.json'), 'utf8')
  try {
    return JSON.parse(raw) as PikkuConfigFile
  } catch (error) {
    throw new Error(
      `pikku.config.json does not parse: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const discoveredApps = (workspaceRoot: string): VerifyFrontend[] => {
  const appsDir = join(workspaceRoot, 'apps')
  if (!existsSync(appsDir)) return []
  return readdirSync(appsDir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith('_') &&
        existsSync(join(appsDir, e.name, 'tsconfig.json'))
    )
    .map((e) => ({ name: e.name, dir: join(appsDir, e.name) }))
}

/** Reads the project layout a verify run needs from pikku.config.json, discovering `apps/*` when no frontends are declared. */
export function readVerifyProject(rootDir: string): VerifyProject {
  const config = readConfig(rootDir)
  const workspaceRoot = findWorkspaceRoot(rootDir)
  const declared = config.frontends
  const frontends = declared
    ? Object.entries(declared)
        .filter(([, fe]) => fe?.cwd && fe.deploy !== false)
        .map(([name, fe]) => ({ name, dir: resolve(rootDir, fe.cwd!) }))
        .filter((fe) => existsSync(join(fe.dir, 'tsconfig.json')))
    : discoveredApps(workspaceRoot)
  return {
    rootDir,
    workspaceRoot,
    outDir: resolve(rootDir, config.outDir ?? '.pikku'),
    srcDirectories: (config.srcDirectories ?? ['src']).map((d) =>
      resolve(rootDir, d)
    ),
    tsconfig: resolve(rootDir, config.tsconfig ?? 'tsconfig.json'),
    frontends,
    i18nIgnore: (config.i18n?.ignore ?? [])
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.replace(/^\.\//, '').replace(/\/+$/, '')),
  }
}

export const relativeTo = (root: string, file: string): string => {
  const rel = relative(root, file)
  return rel.startsWith('..') ? file : rel
}

const WORKSPACE_SKIP = new Set(['node_modules', 'dist', 'build', 'src'])

/**
 * Every `apps/*` and `packages/*` directory, plus every deeper one (at most three levels down) that is a package
 * or a TypeScript project root: it has a `package.json` or a `tsconfig*.json`. This is where the source checks look, so
 * `packages/addons/spindle` is covered as well as `apps/app` and `packages/functions`. Nested roots are listed
 * too; a file belongs to the deepest one that contains it (see `ownerDir`).
 */
export function workspacePackageDirs(workspaceRoot: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (
      depth === 1 ||
      (depth > 1 &&
        entries.some(
          (e) =>
            e.isFile() &&
            (e.name === 'package.json' || /^tsconfig.*\.json$/.test(e.name))
        ))
    )
      found.push(dir)
    if (depth >= 3) return
    for (const e of entries) {
      if (
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        !WORKSPACE_SKIP.has(e.name)
      )
        walk(join(dir, e.name), depth + 1)
    }
  }
  for (const group of ['apps', 'packages']) {
    const groupDir = join(workspaceRoot, group)
    if (existsSync(groupDir)) walk(groupDir, 0)
  }
  return found
}

/** The deepest directory of `dirs` that contains `file`, or undefined. */
export function ownerDir(
  dirs: readonly string[],
  file: string
): string | undefined {
  let best: string | undefined
  for (const d of dirs)
    if (file.startsWith(d + '/') && (!best || d.length > best.length)) best = d
  return best
}
