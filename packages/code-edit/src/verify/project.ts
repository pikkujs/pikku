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
}

type PikkuConfigFile = {
  outDir?: string
  srcDirectories?: string[]
  tsconfig?: string
  frontends?: Record<string, { cwd?: string; deploy?: boolean }>
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
  }
}

export const relativeTo = (root: string, file: string): string => {
  const rel = relative(root, file)
  return rel.startsWith('..') ? file : rel
}
