import packageInfo from '../package.json' with { type: 'json' }
import { relative, dirname } from 'path'
import { PathToNameAndType, VisitState } from './inspector/visit.js'
import { mkdir, writeFile } from 'fs/promises'

export const getFileImportRelativePath = (
  from: string,
  to: string,
  packageMappings: Record<string, string>
): string => {
  let filePath = relative(dirname(from), to)
  if (!/^\.+\//.test(filePath)) {
    filePath = `./${filePath}`
  }
  let usesPackageName = false
  for (const [path, packageName] of Object.entries(packageMappings)) {
    if (to.includes(path)) {
      usesPackageName = true
      filePath = filePath.replace(new RegExp(`.*${path}`), packageName)
      break
    }
  }
  if (usesPackageName) {
    return filePath.replace('.ts', '')
  }
  return filePath.replace('.ts', '.js')
}

interface Meta {
  file: string
  variable: string
  type: string
  typePath: string
}

export type FilesAndMethods = {
  userSessionType: Meta
  sessionServicesType: Meta
  vrameworkConfigFactory: Meta
  singletonServicesFactory: Meta
  sessionServicesFactory: Meta
}

export interface VrameworkCLIOptions {
  config?: string
  configFileType?: string
  userSessionType?: string
  singletonServicesFactoryType?: string
  sessionServicesFactoryType?: string
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

export const getVrameworkFilesAndMethods = async (
  {
    sessionServicesTypeImportMap: httpSessionServicesTypeImportMap,
    userSessionTypeImportMap,
    sessionServicesFactories,
    singletonServicesFactories,
    configFactories,
  }: VisitState,
  packageMappings: Record<string, string>,
  outputFile: string,
  {
    configFileType,
    singletonServicesFactoryType,
    sessionServicesFactoryType,
  }: VrameworkCLIOptions,
  requires: Partial<{
    config: boolean
    sessionServiceType: boolean
    userSessionType: boolean
    singletonServicesFactory: boolean
    sessionServicesFactory: boolean
  }> = {
    config: false,
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
    sessionServicesType: getMetaTypes(
      'CoreServices',
      requires.sessionServiceType ? errors : new Map(),
      httpSessionServicesTypeImportMap
    ),
    vrameworkConfigFactory: getMetaTypes(
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

    console.error(result.join('\n'))
    process.exit(1)
  }

  return result as FilesAndMethods
}

export const writeFileInDir = async (
  path: string,
  content: string,
  ignoreModifyComment: boolean = false
) => {
  if (content.includes('server-only')) {
    content = content.replace(
      "'server-only'",
      `'server-only'\n\n${ignoreModifyComment ? '' : DO_NOT_MODIFY_COMMENT}`
    )
  } else {
    content = `${ignoreModifyComment ? '' : DO_NOT_MODIFY_COMMENT}${content}`
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
  console.log(`\x1b[32m✓ File written to ${path}\x1b[0m`)
}

export const logCommandInfoAndTime = async (
  commandStart: string,
  commandEnd: string,
  [skipCondition, skipMessage = 'none found']: [boolean] | [boolean, string],
  callback: (...args: any[]) => Promise<unknown>
): Promise<boolean> => {
  if (skipCondition === true) {
    console.log(
      `\x1b[34m• Skipping ${commandStart} since ${skipMessage}.\x1b[0m`
    )
    return false
  }

  const start = Date.now()
  console.log(`\x1b[34m• ${commandStart}...\x1b[0m`)
  await callback()

  console.log(`\x1b[32m✓ ${commandEnd} in ${Date.now() - start}ms.\x1b[0m`)
  return true
}

export const logVrameworkLogo = () => {
  console.log(`\x1b[33m⚙️ VRAMEWORK CLI ⚙️\n-------------------\x1b[0m`)
}

export const DO_NOT_MODIFY_COMMENT = `/**
* This file was generated by @vramework/cli@${packageInfo.version}
*/\n\n`
