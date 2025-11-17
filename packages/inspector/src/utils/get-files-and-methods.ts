import {
  PathToNameAndType,
  InspectorState,
  InspectorOptions,
} from '../types.js'

interface Meta {
  file: string
  variable: string
  type: string
  typePath: string
}

export type FilesAndMethods = {
  userSessionType: Meta
  wireServicesType: Meta
  singletonServicesType: Meta
  pikkuConfigType: Meta
  pikkuConfigFactory: Meta
  singletonServicesFactory: Meta
  wireServicesFactory: Meta
}

export type FilesAndMethodsErrors = Map<string, PathToNameAndType>

const getMetaTypes = (
  type: string,
  map: PathToNameAndType,
  desiredType?: string,
  errors?: FilesAndMethodsErrors
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
    if (errors) {
      errors.set(`No ${desiredType} found that extends ${type}`, map)
    }
    return
  }

  const totalValues = Array.from(map.values()).flat()

  if (totalValues.length === 0) {
    const helpMessage =
      type === 'CoreConfig'
        ? `No ${type} found. Make sure you have exported a createConfig function in your codebase:\n\n` +
          `export const createConfig = pikkuConfig(async () => {\n` +
          `  return {}\n` +
          `})\n\n` +
          `Possible issues:\n` +
          `- srcDirectories in pikku.config.json doesn't include the file with the createConfig method`
        : `No ${type} found`
    if (errors) {
      errors.set(helpMessage, map)
    }
  } else if (totalValues.length > 1) {
    if (errors) {
      errors.set(`More than one ${type} found`, map)
    }
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

export const getFilesAndMethods = (
  {
    singletonServicesTypeImportMap,
    wireServicesTypeImportMap,
    userSessionTypeImportMap,
    configTypeImportMap,
    wireServicesFactories,
    singletonServicesFactories,
    configFactories,
  }: InspectorState,
  {
    configFileType,
    userSessionType,
    singletonServicesFactoryType,
    wireServicesFactoryType,
  }: InspectorOptions['types'] = {}
): { result: Partial<FilesAndMethods>; errors: FilesAndMethodsErrors } => {
  const errors: FilesAndMethodsErrors = new Map()

  const result: Partial<FilesAndMethods> = {
    userSessionType: getMetaTypes(
      'CoreUserSession',
      userSessionTypeImportMap,
      userSessionType,
      errors
    ),
    singletonServicesType: getMetaTypes(
      'CoreSingletonServices',
      singletonServicesTypeImportMap,
      undefined,
      errors
    ),
    wireServicesType: getMetaTypes(
      'CoreServices',
      wireServicesTypeImportMap,
      undefined,
      errors
    ),
    pikkuConfigType: getMetaTypes(
      'CoreConfig',
      configTypeImportMap,
      undefined,
      errors
    ),
    pikkuConfigFactory: getMetaTypes(
      'CoreConfig',
      configFactories,
      configFileType,
      errors
    ),
    singletonServicesFactory: getMetaTypes(
      'CreateSingletonServices',
      singletonServicesFactories,
      singletonServicesFactoryType,
      errors
    ),
    wireServicesFactory: getMetaTypes(
      'CreateWireServices',
      wireServicesFactories,
      wireServicesFactoryType,
      errors
    ),
  }

  return { result, errors }
}
