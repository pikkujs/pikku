import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** What the Vite plugins need to know about the project, read from `pikku.config.json`. */
export interface PikkuViteProject {
  /** Directory holding `pikku.config.json`. */
  configDir: string
  /** True when the project declares Better Auth, i.e. its generated auth wiring exists. */
  betterAuth: boolean
  /** Absolute path of the generated `env.gen.ts` exporting `apiUrl()`, when configured. */
  envFile?: string
}

type RawConfig = {
  rootDir?: string
  scaffold?: { pikkuDir?: string }
  clientFiles?: { envFile?: string }
}

/**
 * The workspace package marked `"main": true` in its own pikku.config.json,
 * relative to `rootDir`: the package that owns the wirings and services. Found
 * the way the CLI finds it, in the `workspaces` of `rootDir/package.json`.
 */
const mainPackageEntry = (rootDir: string): string | undefined => {
  let workspaces: unknown
  try {
    workspaces = JSON.parse(
      readFileSync(join(rootDir, 'package.json'), 'utf8')
    ).workspaces
  } catch {
    return undefined
  }
  const patterns: unknown[] = Array.isArray(workspaces)
    ? workspaces
    : Array.isArray(
          (workspaces as { packages?: unknown } | undefined)?.packages
        )
      ? (workspaces as { packages: unknown[] }).packages
      : []
  const skipped = (name: string) =>
    name.startsWith('.') ||
    ['node_modules', 'dist', 'build', 'coverage'].includes(name)
  const matches = (pattern: string): string[] => {
    let dirs = ['']
    for (const segment of pattern.replace(/^\.\//, '').split('/')) {
      if (segment === '') continue
      dirs = dirs.flatMap((dir) => {
        if (!segment.includes('*')) return [join(dir, segment)]
        const matcher = new RegExp(
          `^${segment
            .split('*')
            .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^/]*')}$`
        )
        try {
          return readdirSync(join(rootDir, dir), { withFileTypes: true })
            .filter(
              (e) =>
                (e.isDirectory() || e.isSymbolicLink()) &&
                !skipped(e.name) &&
                matcher.test(e.name)
            )
            .map((e) => join(dir, e.name))
        } catch {
          return []
        }
      })
    }
    return dirs
  }
  const excluded = new Set(
    patterns
      .filter((p): p is string => typeof p === 'string' && p.startsWith('!'))
      .flatMap((p) => matches(p.slice(1)))
  )
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.startsWith('!')) continue
    for (const entry of matches(pattern).sort()) {
      if (entry === '' || excluded.has(entry)) continue
      try {
        const config = JSON.parse(
          readFileSync(join(rootDir, entry, 'pikku.config.json'), 'utf8')
        )
        if (config.main === true) return entry
      } catch {}
    }
  }
  return undefined
}

/** Walk up from `from` to the nearest `pikku.config.json`. */
export const findPikkuConfig = (from: string): string | undefined => {
  let dir = resolve(from)
  for (;;) {
    const candidate = join(dir, 'pikku.config.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const absolute = (base: string, path: string): string =>
  isAbsolute(path) ? path : join(base, path)

/**
 * Where the CLI writes the Better Auth wiring: `scaffold.pikkuDir`, or `src/scaffold` of the workspace's `main` package when it has one. Its presence is the project saying it uses
 * Better Auth, the same signal `pikku all` acts on.
 */
const authWiringFile = (config: RawConfig, configDir: string): string => {
  const rootDir = absolute(configDir, config.rootDir ?? '.')
  const scaffoldDir = config.scaffold?.pikkuDir
    ? absolute(rootDir, config.scaffold.pikkuDir)
    : absolute(
        rootDir,
        join(mainPackageEntry(rootDir) ?? '.', 'src', 'scaffold')
      )
  return join(scaffoldDir, 'auth', 'auth.gen.ts')
}

/**
 * Read the project's `pikku.config.json`, found from `from` upward. A project
 * with none gets the defaults: test ids only.
 */
export const readPikkuViteProject = (
  from: string = process.cwd()
): PikkuViteProject | undefined => {
  const configPath = findPikkuConfig(from)
  if (!configPath) return undefined
  const configDir = dirname(configPath)
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as RawConfig
  return {
    configDir,
    betterAuth: existsSync(authWiringFile(config, configDir)),
    envFile: config.clientFiles?.envFile
      ? absolute(configDir, config.clientFiles.envFile)
      : undefined,
  }
}
