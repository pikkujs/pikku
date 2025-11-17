import {
  PathToNameAndType,
  InspectorState,
  InspectorOptions,
} from '@pikku/inspector'

interface Meta {
  file: string
  variable: string
  type: string
  typePath: string
  errors: Map<string, string[]>
}

export type FilesAndMethods = {
  userSessionType: Meta
  interactionServicesType: Meta
  singletonServicesType: Meta
  pikkuConfigFactory: Meta
  singletonServicesFactory: Meta
  interactionServicesFactory: Meta
}

const getMetaTypes = (
  type: string,
  map: PathToNameAndType,
  desiredType?: string
): Meta | undefined => {
  const errors = new Map()

  if (desiredType) {
    for (const [file, meta] of map.entries()) {
      for (const { type: entryType, variable, typePath } of meta) {
        if (entryType === desiredType) {
          if (entryType === null || typePath === null) {
            throw new Error(
              `Unknown state due to metaType calculation: entryType or typePath is null for ${desiredType} in ${file}`
            )
          }
          return { file, variable, type: entryType, typePath, errors }
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
      return { file, type: entryType, variable, typePath, errors }
    }
  }

  return
}

/**
 * @deprecated Use state.filesAndMethods from InspectorState instead
 */
export const getPikkuFilesAndMethods = async (
  state: InspectorState,
  options: InspectorOptions['types'] = {}
): Promise<FilesAndMethods> => {
  const {
    singletonServicesTypeImportMap,
    interactionServicesTypeImportMap,
    userSessionTypeImportMap,
    interactionServicesFactories,
    singletonServicesFactories,
    configFactories,
  } = state

  const {
    configFileType,
    userSessionType,
    singletonServicesFactoryType,
    interactionServicesFactoryType,
  } = options
  let errors = new Map<string, PathToNameAndType>()

  const result: Partial<FilesAndMethods> = {
    userSessionType: getMetaTypes(
      'CoreUserSession',
      userSessionTypeImportMap,
      userSessionType
    ),
    singletonServicesType: getMetaTypes(
      'CoreSingletonServices',
      singletonServicesTypeImportMap
    ),
    interactionServicesType: getMetaTypes(
      'CoreServices',
      interactionServicesTypeImportMap
    ),
    pikkuConfigFactory: getMetaTypes(
      'CoreConfig',
      configFactories,
      configFileType
    ),
    singletonServicesFactory: getMetaTypes(
      'CreateSingletonServices',
      singletonServicesFactories,
      singletonServicesFactoryType
    ),
    interactionServicesFactory: getMetaTypes(
      'CreateInteractionServices',
      interactionServicesFactories,
      interactionServicesFactoryType
    ),
  }

  if (errors.size > 0) {
    const result: string[] = ['Found errors:']
    errors.forEach((filesAndMethods, message) => {
      result.push(`- ${message}`)
      filesAndMethods.forEach((methods, file) => {
        result.push(
          `\t* methods: ${methods.map(({ variable, type }) => `${variable}: ${type}`).join(', ')}`
        )
      })
    })
    throw new Error(result.join('\n'))
  }

  return result as FilesAndMethods
}
