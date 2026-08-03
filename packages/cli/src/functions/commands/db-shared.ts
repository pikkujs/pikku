import { existsSync } from 'fs'
import { resolve, join } from 'path'
import { loadUserModule } from './load-user-project.js'

export interface UserConfigShape {
  sqliteDb?: string
  postgresUrl?: string
  /**
   * Postgres extensions the CLI's embedded PGlite databases must load — the
   * local dev database, and the shadow one every `db` command migrates to type
   * and diff a schema.
   *
   * A bare name is one of PGlite's bundled contrib extensions (`hstore`,
   * `citext`, `uuid_ossp`, …) and needs nothing installed. Anything else is a
   * package the project depends on, such as `@electric-sql/pglite-pgvector`.
   *
   * Needed even when `postgresUrl` points at a server that already has the
   * extension: the shadow database is PGlite regardless, so a `CREATE EXTENSION`
   * in a migration fails there unless it is declared here.
   */
  pgliteExtensions?: string[]
  [key: string]: unknown
}

interface LoadOptions {
  config: { rootDir: string; srcDirectories: string[] }
  logger: { error: (msg: string) => void; warn: (msg: string) => void }
}

function findUserConfigFactoryFile(
  rootDir: string,
  srcDirectories: string[]
): string | null {
  for (const srcDir of srcDirectories) {
    for (const name of ['config.ts', 'config.js']) {
      const candidate = resolve(rootDir, srcDir, name)
      if (existsSync(candidate)) return candidate
    }
  }

  for (const name of ['config.ts', 'config.js']) {
    const candidate = join(rootDir, name)
    if (existsSync(candidate)) return candidate
  }

  return null
}

export async function loadUserConfigForDb(
  options: LoadOptions
): Promise<UserConfigShape | null> {
  const { config, logger } = options
  const hasSqliteDbAssets = existsSync(join(config.rootDir, 'db', 'sqlite'))
  const hasPostgresDbAssets = existsSync(join(config.rootDir, 'db', 'postgres'))
  const hasConventionalDbAssets = hasSqliteDbAssets || hasPostgresDbAssets

  const getFallbackConfig = (): UserConfigShape | null => {
    if (hasSqliteDbAssets) return { sqliteDb: '.pikku-runtime/dev.db' }
    if (hasPostgresDbAssets) return {}
    return null
  }

  const configFactoryFile = findUserConfigFactoryFile(
    config.rootDir,
    config.srcDirectories
  )
  if (!configFactoryFile) {
    if (hasConventionalDbAssets) {
      return getFallbackConfig()
    }
    logger.error('createConfig must be defined in your project')
    return null
  }

  let configModule: Record<string, any>
  try {
    configModule = await loadUserModule(configFactoryFile)
  } catch (error: any) {
    if (hasConventionalDbAssets) {
      logger.warn(
        `Falling back to default local db config because '${configFactoryFile}' could not be loaded: ${error.message}`
      )
      return getFallbackConfig()
    }
    throw error
  }

  const userCreateConfig = configModule.createConfig
  if (typeof userCreateConfig !== 'function') {
    if (hasConventionalDbAssets) {
      logger.warn(
        `Falling back to default local db config because '${configFactoryFile}' does not export createConfig`
      )
      return getFallbackConfig()
    }
    logger.error(
      `Expected 'createConfig' in '${configFactoryFile}' to be a function`
    )
    return null
  }
  return (await userCreateConfig()) as UserConfigShape
}
