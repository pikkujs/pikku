import { relative, dirname, resolve } from 'path'
import { PathToNameAndType, InspectorState, TypesMap } from '@pikku/inspector'
import { mkdir, writeFile } from 'fs/promises'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)

const logo = `
 ______ _ _     _           
(_____ (_) |   | |          
 _____) )| |  _| |  _ _   _ 
|  ____/ | |_/ ) |_/ ) | | |
| |    | |  _ (|  _ (| |_| |
|_|    |_|_| \_)_| \_)____/ 
`

export class CLILogger {
  constructor({ logLogo }: { logLogo: boolean }) {
    if (logLogo) {
      this.logPikkuLogo()
    }
  }

  primary(message: string) {
    console.log(chalk.green(message))
  }
  success(message: string) {
    console.log(chalk.green(message))
  }
  info(message: string) {
    console.log(chalk.blue(message))
  }
  error(message: string) {
    console.error(chalk.red(message))
  }
  warn(message: string) {
    console.error(chalk.yellow(message))
  }
  debug(message: string) {
    if (process.env.DEBUG) {
      console.log(chalk.gray(message))
    }
  }

  private logPikkuLogo() {
    this.primary(logo)
    const packageJson = JSON.parse(
      readFileSync(`${dirname(__filename)}/../../package.json`, 'utf-8')
    )
    this.primary(`⚙️ Welcome to the Pikku CLI (v${packageJson.version})\n`)
  }
}

export const getFileImportRelativePath = (
  from: string,
  to: string,
  packageMappings: Record<string, string>
): string => {
  let filePath = relative(dirname(from), to)
  if (!/^\.+\//.test(filePath)) {
    filePath = `./${filePath}`
  }

  const absolutePath = resolve(dirname(from), to)
  // let usesPackageName = false
  for (const [path, packageName] of Object.entries(packageMappings)) {
    if (absolutePath.includes(path)) {
      // usesPackageName = true
      filePath = absolutePath.replace(new RegExp(`.*${path}`), packageName)
      break
    }
  }

  // if (usesPackageName) {
  //   return filePath.replace('.ts', '')
  // }
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

export const writeFileInDir = async (
  logger: CLILogger,
  path: string,
  content: string,
  {
    ignoreModifyComment = false,
    logWrite = true,
  }: { ignoreModifyComment?: boolean; logWrite?: boolean } = {}
) => {
  if (path.includes('.json')) {
    ignoreModifyComment = true
  }

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

  if (logWrite) {
    logger.success(`✓ File written to ${path}`)
  }
}

export const logCommandInfoAndTime = async (
  logger: CLILogger,
  commandStart: string,
  commandEnd: string,
  [skipCondition, skipMessage = 'none found']: [boolean] | [boolean, string],
  callback: (...args: any[]) => Promise<unknown>
): Promise<boolean> => {
  if (skipCondition === true) {
    logger.info(
      `• Skipping ${commandStart.charAt(0).toLocaleLowerCase()}${commandStart.slice(1)} since ${skipMessage}.`
    )
    return false
  }

  const start = Date.now()
  chalk.blue(`• ${commandStart}...`)
  await callback()

  logger.success(`✓ ${commandEnd} in ${Date.now() - start}ms.`)
  return true
}

// TODO: add version back in once the ESM dust settles
export const DO_NOT_MODIFY_COMMENT = `/**
 * This file was generated by the @pikku/cli
 */
`

export const serializeFileImports = (
  importType: string,
  outputPath: string,
  files: Set<string>,
  packageMappings: Record<string, string> = {}
) => {
  const serializedOutput: string[] = [
    `/* The files with an ${importType} function call */`,
  ]

  Array.from(files)
    .sort()
    .forEach((path) => {
      const filePath = getFileImportRelativePath(
        outputPath,
        path,
        packageMappings
      )
      serializedOutput.push(`import '${filePath}'`)
    })

  return serializedOutput.join('\n')
}

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  return `
// Custom types are those that are defined directly within generics
// or are broken into simpler types
${Array.from(typesMap.customTypes.entries())
  .map(([name, { type, references }]) => {
    references.forEach((name) => {
      const originalName = typesMap.getTypeMeta(name).originalName
      requiredTypes.add(originalName)
    })
    return `export type ${name} = ${type}`
  })
  .join('\n')}`
}
