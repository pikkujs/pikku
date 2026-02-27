import * as vscode from 'vscode'
import { readFile } from 'fs/promises'
import { join, resolve, dirname, isAbsolute } from 'path'

export interface PikkuConfig {
  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  tsconfig: string
  outDir: string
  configDir: string
  userSessionType?: string
  singletonServicesFactoryType?: string
  wireServicesFactoryType?: string
  configFile?: string
  tags?: string[]
  addon?: boolean
  packageMappings?: Record<string, string>
  schema?: {
    additionalProperties?: boolean
    supportsImportAttributes?: boolean
  }
}

export async function findConfigFile(
  workspaceRoot: string
): Promise<string | undefined> {
  const patterns = ['pikku.config.json', 'pikku.config.js', 'pikku.config.ts']
  for (const pattern of patterns) {
    const files = await vscode.workspace.findFiles(
      `**/${pattern}`,
      '**/node_modules/**',
      1
    )
    if (files.length > 0) {
      return files[0].fsPath
    }
  }
  return undefined
}

export async function loadConfig(configPath: string): Promise<PikkuConfig> {
  const content = await readFile(configPath, 'utf-8')
  const config = JSON.parse(content)
  const configDir = dirname(configPath)

  const rootDir = config.rootDir
    ? resolve(configDir, config.rootDir)
    : configDir

  const tsconfig = config.tsconfig
    ? isAbsolute(config.tsconfig)
      ? config.tsconfig
      : join(rootDir, config.tsconfig)
    : join(rootDir, 'tsconfig.json')

  return {
    ...config,
    configDir,
    rootDir,
    tsconfig,
    srcDirectories: config.srcDirectories || ['src'],
    ignoreFiles: config.ignoreFiles || [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
    ],
    packageMappings: config.packageMappings || {},
    schema: {
      additionalProperties: false,
      supportsImportAttributes: true,
      ...config.schema,
    },
  }
}
