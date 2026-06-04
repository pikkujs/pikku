import { existsSync } from 'fs'
import { resolve, join } from 'path'
import { loadUserModule } from './load-user-project.js'
import type { DevDbConfig } from '../db/local-db.js'

export interface UserConfigShape {
  dev?: {
    db?: DevDbConfig
  }
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
  const hasConventionalDbAssets =
    existsSync(join(config.rootDir, 'db', 'migrations')) ||
    existsSync(join(config.rootDir, 'db', 'seed.sql'))
  const configFactoryFile = findUserConfigFactoryFile(
    config.rootDir,
    config.srcDirectories
  )
  if (!configFactoryFile) {
    if (hasConventionalDbAssets) {
      return { dev: { db: true } }
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
      return { dev: { db: true } }
    }
    throw error
  }

  const userCreateConfig = configModule.createConfig
  if (typeof userCreateConfig !== 'function') {
    if (hasConventionalDbAssets) {
      logger.warn(
        `Falling back to default local db config because '${configFactoryFile}' does not export createConfig`
      )
      return { dev: { db: true } }
    }
    logger.error(
      `Expected 'createConfig' in '${configFactoryFile}' to be a function`
    )
    return null
  }
  return (await userCreateConfig()) as UserConfigShape
}
