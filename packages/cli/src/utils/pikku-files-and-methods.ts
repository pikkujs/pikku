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
) => {
  if (desiredType) {
    const entries = Object.entries(map)
    for (const [file, meta] of entries) {
      for (const { type, variable, typePath } of meta) {
        if (type === desiredType) {
          return { file, variable, type, typePath }
        }
      }
    }
    errors.set(`No ${desiredType} found that extends ${type}`, map)
    return undefined
  }

  const totalValues = Object.values(map).flat()
  if (totalValues.length === 0) {
    errors.set(`No ${type} found`, map)
  } else if (totalValues.length > 1) {
    errors.set(`More than one ${type} found`, map)
  } else {
    const entry = Object.entries(map)[0]
    if (entry) {
      const [file, [{ type, variable, typePath }]] = entry
      return { file, type, variable, typePath }
    }
  }

  return undefined
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
      configFileType
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
      for (const [file, methods] of Object.entries(filesAndMethods)) {
        result.push(
          `\t* file: ${getFileImportRelativePath(outputFile, file, packageMappings)}`
        )
        result.push(
          `\t* methods: ${methods.map(({ variable, type }) => `${variable}: ${type}`).join(', ')}`
        )
      }
    })

    logger.error(result.join('\n'))
    process.exit(1)
  }

  return result as FilesAndMethods
}
