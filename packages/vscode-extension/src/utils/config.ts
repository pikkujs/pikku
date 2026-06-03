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
  _workspaceRoot: string
): Promise<string | undefined> {
  // Use null for exclude to bypass VS Code's files.exclude / search.exclude
  const files = await vscode.workspace.findFiles(
    '**/pikku.config.{json,js,ts}',
    null,
    500
  )

  // Filter out node_modules and dist ourselves
  const filtered = files.filter((f) => {
    const p = f.fsPath
    return !p.includes('/node_modules/') && !p.includes('/dist/')
  })

  if (filtered.length === 0) return undefined
  if (filtered.length === 1) return filtered[0].fsPath

  // Auto-detect: find the config nearest to the active editor file
  const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath
  if (activeFilePath) {
    const nearest = findNearestConfig(activeFilePath, filtered)
    if (nearest) return nearest
  }

  // Fallback: let the user pick
  const items = filtered
    .map((f) => ({
      label: vscode.workspace.asRelativePath(f),
      fsPath: f.fsPath,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select pikku.config (${filtered.length} found)`,
  })

  return picked?.fsPath
}

/**
 * Walk up from `filePath` and return the config whose directory
 * is the closest ancestor (i.e. longest matching prefix).
 */
function findNearestConfig(
  filePath: string,
  configs: vscode.Uri[]
): string | undefined {
  const configDirs = configs.map((f) => ({
    dir: dirname(f.fsPath),
    fsPath: f.fsPath,
  }))

  let best: { dir: string; fsPath: string } | undefined
  for (const entry of configDirs) {
    // The config's directory must be an ancestor of (or equal to) the file
    if (
      filePath.startsWith(entry.dir + '/') ||
      filePath.startsWith(entry.dir + '\\')
    ) {
      // Pick the deepest (longest) matching ancestor
      if (!best || entry.dir.length > best.dir.length) {
        best = entry
      }
    }
  }

  return best?.fsPath
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
