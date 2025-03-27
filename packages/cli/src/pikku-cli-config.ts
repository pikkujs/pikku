import { join, dirname, resolve, isAbsolute } from 'path'
import { readdir, readFile } from 'fs/promises'
import { OpenAPISpecInfo } from './openapi/openapi-spec-generator.js'
import { InspectorFilters } from '@pikku/inspector'

export interface PikkuCLICoreOutputFiles {
  outDir?: string
  routesFile: string
  channelsFile: string
  schedulersFile: string
  schemaDirectory: string
  typesDeclarationFile: string
  routesMapDeclarationFile: string
  channelsMapDeclarationFile: string
  bootstrapFile: string
}

export type PikkuCLIConfig = {
  $schema?: string

  extends?: string

  rootDir: string
  routeDirectories: string[]
  packageMappings: Record<string, string>
  supportsImportAttributes: boolean

  configDir: string
  tsconfig: string

  nextBackendFile?: string
  nextHTTPFile?: string
  fetchFile?: string
  websocketFile?: string

  openAPI?: {
    outputFile: string
    additionalInfo: OpenAPISpecInfo
  }

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

const CONFIG_DIR_FILES = [
  'nextBackendFile',
  'nextHTTPFile',
  'fetchFile',
  'websocketFile',
]

export const getPikkuCLIConfig = async (
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  tags: string[] = [],
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  const config = await _getPikkuCLIConfig(
    configFile,
    requiredFields,
    tags,
    exitProcess
  )
  return config
}

const _getPikkuCLIConfig = async (
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  tags: string[] = [],
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  if (!configFile) {
    let execDirectory = process.cwd()
    const files = await readdir(execDirectory)
    const file = files.find((file) => /pikku\.config\.(ts|js|json)$/.test(file))
    if (!file) {
      const errorMessage =
        '\nConfig file pikku.config.json not found\nExiting...'
      if (exitProcess) {
        console.error(errorMessage)
        process.exit(1)
      }
      throw new Error(errorMessage)
    }
    configFile = join(execDirectory, file)
  }

  try {
    let result: PikkuCLIConfig
    const file = await readFile(configFile, 'utf-8')
    const configDir = dirname(configFile)
    const config: PikkuCLIConfig = JSON.parse(file)
    if (config.extends) {
      const extendedConfig = await getPikkuCLIConfig(
        resolve(configDir, config.extends),
        [],
        tags,
        exitProcess
      )
      result = {
        ...extendedConfig,
        ...config,
        configDir,
        packageMappings: {
          ...extendedConfig.packageMappings,
          ...config.packageMappings,
        },
      }
    } else {
      result = {
        ...config,
        configDir,
        packageMappings: config.packageMappings || {},
        rootDir: config.rootDir
          ? resolve(configDir, config.rootDir)
          : configDir,
      }
    }

    if (result.outDir) {
      if (!result.schemaDirectory) {
        result.schemaDirectory = join(result.outDir, 'pikku-schemas')
      }
      if (!result.routesFile) {
        result.routesFile = join(result.outDir, 'pikku-routes.gen.ts')
      }
      if (!result.schedulersFile) {
        result.schedulersFile = join(result.outDir, 'pikku-schedules.gen.ts')
      }
      if (!result.channelsFile) {
        result.channelsFile = join(result.outDir, 'pikku-channels.gen.ts')
      }
      if (!result.typesDeclarationFile) {
        result.typesDeclarationFile = join(result.outDir, 'pikku-types.gen.ts')
      }
      if (!result.routesMapDeclarationFile) {
        result.routesMapDeclarationFile = join(
          result.outDir,
          'pikku-routes-map.gen.d.ts'
        )
      }
      if (!result.channelsMapDeclarationFile) {
        result.channelsMapDeclarationFile = join(
          result.outDir,
          'pikku-channels-map.gen.d.ts'
        )
      }
      if (!result.bootstrapFile) {
        result.bootstrapFile = join(result.outDir, 'pikku-bootstrap.gen.ts')
      }
    }

    if (requiredFields.length > 0) {
      validateCLIConfig(result, requiredFields)
    }

    for (const objectKey of Object.keys(result)) {
      if (objectKey.endsWith('File') || objectKey.endsWith('Directory')) {
        const relativeTo = CONFIG_DIR_FILES.includes(objectKey)
          ? result.configDir
          : result.rootDir
        if (result[objectKey]) {
          if (!isAbsolute(result[objectKey])) {
            result[objectKey] = join(relativeTo, result[objectKey])
          }
        }
      }
    }

    result.filters = result.filters || {}
    if (tags.length > 0) {
      result.filters.tags = tags
    }

    if (!isAbsolute(result.tsconfig)) {
      result.tsconfig = join(result.rootDir, result.tsconfig)
    }

    return result
  } catch (e: any) {
    console.error(e)
    console.error(`Config file not found: ${configFile}`)
    process.exit(1)
  }
}

export const validateCLIConfig = (
  cliConfig: PikkuCLIConfig,
  required: Array<keyof PikkuCLIConfig>
) => {
  let errors: string[] = []
  for (const key of required) {
    if (!cliConfig[key]) {
      errors.push(key)
    }
  }

  if (errors.length > 0) {
    console.error(
      `${errors.join(', ')} ${errors.length === 1 ? 'is' : 'are'} required in pikku.config.json`
    )
    process.exit(1)
  }
}
