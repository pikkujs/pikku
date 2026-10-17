import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { glob } from 'tinyglobby'
import type { InspectorOptions } from '@pikku/inspector'

const DEFAULT_IGNORE = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/node_modules/**',
  '**/dist/**',
]

const readConfig = (configFile: string): Record<string, any> => {
  const config = JSON.parse(readFileSync(configFile, 'utf8'))
  const configDir = dirname(configFile)
  if (!config.extends) {
    return {
      ...config,
      rootDir: resolve(configDir, config.rootDir ?? '.'),
      tsconfig: config.tsconfig
        ? resolve(configDir, config.tsconfig)
        : undefined,
    }
  }
  const base = readConfig(resolve(configDir, config.extends))
  return {
    ...base,
    ...config,
    rootDir: config.rootDir ? resolve(configDir, config.rootDir) : base.rootDir,
    tsconfig: config.tsconfig
      ? resolve(configDir, config.tsconfig)
      : base.tsconfig,
    schema: { ...base.schema, ...config.schema },
  }
}

export interface ProjectInput {
  projectDir: string
  routeFiles: string[]
  options: InspectorOptions
}

/**
 * The inspector call `pikku all` would make for a project, as far as
 * pikku.config.json says: its source files and the options a full pass takes
 * (packages/cli/src/services.ts). Left out: the scaffold files the CLI adds
 * from derived paths, and the schema cacheDir. Both engines get the same
 * input, so neither changes what a comparison finds.
 */
export const projectInput = async (
  projectDir: string
): Promise<ProjectInput> => {
  const config = readConfig(join(projectDir, 'pikku.config.json'))
  const rootDir: string = config.rootDir
  const routeFiles = (
    await Promise.all(
      (config.srcDirectories ?? []).map((dir: string) =>
        glob('**/*.ts', {
          cwd: join(rootDir, dir),
          ignore: config.ignoreFiles ?? DEFAULT_IGNORE,
          absolute: true,
        })
      )
    )
  )
    .flat()
    .sort()
  const versionsFile = join(rootDir, 'versions.pikku.json')
  return {
    projectDir,
    routeFiles,
    options: {
      setupOnly: false,
      rootDir,
      isAddon: !!config.addon,
      tsconfig: config.tsconfig,
      types: {
        configFileType: config.configFile,
        userSessionType: config.userSessionType,
        singletonServicesFactoryType: config.singletonServicesFactoryType,
        wireServicesFactoryType: config.wireServicesFactoryType,
      },
      tags: config.tags,
      classificationCheck: false,
      strictMeta: !!config.strictMeta,
      modelAliases: config.models ?? {},
      allow: config.allow ?? {},
      schemaConfig: {
        tsconfig: config.tsconfig,
        schemasFromTypes: config.schemasFromTypes,
        schema: config.schema,
      },
      openAPI: config.openAPI
        ? { additionalInfo: config.openAPI.additionalInfo }
        : undefined,
      manifest: existsSync(versionsFile)
        ? JSON.parse(readFileSync(versionsFile, 'utf8'))
        : undefined,
    },
  }
}
