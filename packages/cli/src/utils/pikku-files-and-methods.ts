import { PathToNameAndType, InspectorState } from '@pikku/inspector'
import { CLILogger } from '../services/cli-logger.service.js'
import { getFileImportRelativePath } from './file-import-path.js'

interface Meta {
  file: string
  variable: string
  type: string
  typePath: string
}

export type FilesAndMethods = {
  userSessionType: Meta
  sessionServicesType: Meta
  singletonServicesType: Meta
  pikkuConfigFactory: Meta
  singletonServicesFactory: Meta
  sessionServicesFactory: Meta
}

export interface PikkuCLIOptions {
  watch?: boolean
  config?: string
  configFileType?: string
  userSessionType?: string
  singletonServicesFactoryType?: string
  sessionServicesFactoryType?: string
  tags?: string[]
  types?: string[]
  directories?: string[]
  silent?: boolean
}

const getMetaTypes = (
  type: string,
  errors: Map<string, PathToNameAndType>,
  map: PathToNameAndType,
  desiredType?: string
): Meta | undefined => {
  if (desiredType) {
    for (const [file, meta] of map.entries()) {
      for (const { type: entryType, variable, typePath } of meta) {
        if (entryType === desiredType) {
          if (entryType === null || typePath === null) {
            throw new Error(
              `Unknown state due to metaType calculation: entryType or typePath is null for ${desiredType} in ${file}`
            )
          }
          return { file, variable, type: entryType, typePath }
        }
      }
    }
    errors.set(`No ${desiredType} found that extends ${type}`, map)
    return
  }

  const totalValues = Array.from(map.values()).flat()

  if (totalValues.length === 0) {
    const helpMessage =
      type === 'CoreConfig'
        ? `No ${type} found. Make sure you have exported a createConfig function in your codebase:\n\n` +
          `export const createConfig: CreateConfig<Config> = async () => {\n` +
          `  return {}\n` +
          `}\n\n` +
          `Possible issues:\n` +
          `- srcDirectories in pikku.config.json doesn't include the file with the createConfig method`
        : `No ${type} found`
    errors.set(helpMessage, map)
  } else if (totalValues.length > 1) {
    errors.set(`More than one ${type} found`, map)
  } else {
    const entry = Array.from(map.entries())[0]
    if (entry) {
      const [file, [{ type: entryType, variable, typePath }]] = entry
      if (entryType === null || typePath === null) {
        throw new Error(
          `Unknown state due to metaType calculation: entryType or typePath is null for ${type} in ${file}`
        )
      }
      return { file, type: entryType, variable, typePath }
    }
  }

  return
}

export const getPikkuFilesAndMethods = async (
  logger: CLILogger,
  {
    singletonServicesTypeImportMap,
    sessionServicesTypeImportMap,
    userSessionTypeImportMap,
    sessionServicesFactories,
    singletonServicesFactories,
    configFactories,
  }: InspectorState,
  packageMappings: Record<string, string>,
  outputFile: string,
  {
    configFileType,
    userSessionType,
    singletonServicesFactoryType,
    sessionServicesFactoryType,
  }: PikkuCLIOptions,
  requires: Partial<{
    config: boolean
    sessionServiceType: boolean
    singletonServicesType: boolean
    userSessionType: boolean
    singletonServicesFactory: boolean
    sessionServicesFactory: boolean
  }> = {
    config: false,
    singletonServicesType: false,
    sessionServiceType: false,
    userSessionType: false,
    singletonServicesFactory: false,
    sessionServicesFactory: false,
  }
): Promise<FilesAndMethods> => {
  let errors = new Map<string, PathToNameAndType>()

  const result: Partial<FilesAndMethods> = {
    userSessionType: getMetaTypes(
      'CoreUserSession',
      requires.userSessionType ? errors : new Map(),
      userSessionTypeImportMap,
      userSessionType
    ),
    singletonServicesType: getMetaTypes(
      'CoreSingletonServices',
      requires.singletonServicesType ? errors : new Map(),
      singletonServicesTypeImportMap
    ),
    sessionServicesType: getMetaTypes(
      'CoreServices',
      requires.sessionServiceType ? errors : new Map(),
      sessionServicesTypeImportMap
    ),
    pikkuConfigFactory: getMetaTypes(
      'CoreConfig',
      requires.config ? errors : new Map(),
      configFactories,
      configFileType
    ),
    singletonServicesFactory: getMetaTypes(
      'CreateSingletonServices',
      requires.singletonServicesFactory ? errors : new Map(),
      singletonServicesFactories,
      singletonServicesFactoryType
    ),
    sessionServicesFactory: getMetaTypes(
      'CreateSessionServices',
      requires.sessionServicesFactory ? errors : new Map(),
      sessionServicesFactories,
      sessionServicesFactoryType
    ),
  }

  if (errors.size > 0) {
    const result: string[] = ['Found errors:']
    errors.forEach((filesAndMethods, message) => {
      result.push(`- ${message}`)
      filesAndMethods.forEach((methods, file) => {
        result.push(
          `\t* file: ${getFileImportRelativePath(outputFile, file, packageMappings)}`
        )
        result.push(
          `\t* methods: ${methods.map(({ variable, type }) => `${variable}: ${type}`).join(', ')}`
        )
      })
    })
    throw new Error(result.join('\n'))
  }

  return result as FilesAndMethods
}
