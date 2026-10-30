import { existsSync, readFileSync } from 'node:fs'
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
  srcDirectories?: string[]
  scaffold?: { pikkuDir?: string }
  clientFiles?: { envFile?: string }
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
 * Where the CLI writes the Better Auth wiring: `scaffold.pikkuDir`, or `scaffold/`
 * beside the first source directory. Its presence is the project saying it uses
 * Better Auth, the same signal `pikku all` acts on.
 */
const authWiringFile = (config: RawConfig, configDir: string): string => {
  const rootDir = absolute(configDir, config.rootDir ?? '.')
  const scaffoldDir = config.scaffold?.pikkuDir
    ? absolute(rootDir, config.scaffold.pikkuDir)
    : absolute(rootDir, join(config.srcDirectories?.[0] ?? 'src', 'scaffold'))
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
