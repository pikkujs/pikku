import chalk from 'chalk'
import fs from 'fs'
import path from 'path'

export function deepMerge(target: any, source: any) {
  if (!target || typeof target !== 'object') return source
  if (!source || typeof source !== 'object') return target

  Object.keys(source).forEach((key) => {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  })

  return target
}

export const lazymkdir = async (path: string) => {
  try {
    await fs.mkdirSync(path, { recursive: true })
  } catch {
    // Already exists so ignore
  }
}
/**
 * Moves files from srcDir into destDir, then deletes srcDir.
 */
export function mergeDirectories(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return

  fs.readdirSync(srcDir).forEach((file) => {
    const srcPath = path.join(srcDir, file)
    const destPath = path.join(destDir, file)

    if (fs.statSync(srcPath).isDirectory()) {
      lazymkdir(destPath)
      mergeDirectories(srcPath, destPath)
    } else {
      fs.renameSync(srcPath, destPath)
    }
  })

  fs.rmSync(srcDir, { recursive: true })
}

/**
 * Merges JSON files (package.json, pikku.config.json) by combining properties.
 */
export function mergeJsonFiles(
  sourcePaths: string[],
  targetPath: string,
  fileName: string
): void {
  let mergedData: Record<string, any> = {}

  // Read all JSON files in the target directory
  for (const sourcePath of sourcePaths) {
    const filePath = path.join(sourcePath, fileName)
    if (fs.existsSync(filePath)) {
      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      mergedData = deepMerge(mergedData, fileContent)
      fs.unlinkSync(path.join(sourcePath, fileName))
    }
  }

  // Write merged JSON back
  fs.writeFileSync(
    path.join(targetPath, fileName),
    JSON.stringify(mergedData, null, 2)
  )
}

/**
 * Replaces all occurrences of '../functions' with './' in all project files.
 */
export function replaceFunctionReferences(targetPath: string): void {
  const replaceInFile = (filePath: string): void => {
    let content = fs.readFileSync(filePath, 'utf-8')
    const updatedContent = content
      .replaceAll('../../functions/src/', './')
      .replaceAll('../functions/src/', './')
      .replaceAll('../../functions/.pikku/', '../.pikku/')
      .replaceAll('../functions/types/', './types/')
    fs.writeFileSync(filePath, updatedContent)
  }

  const scanAndReplace = (dir: string): void => {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file)
      if (fs.statSync(fullPath).isDirectory()) {
        scanAndReplace(fullPath)
      } else {
        replaceInFile(fullPath)
      }
    })
  }

  scanAndReplace(targetPath)
}

/**
 * Cleans up the tsconfig.json file
 */
export function cleanTSConfig(targetPath: string): void {
  const tsconfigFile = path.join(targetPath, 'tsconfig.json')
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigFile, 'utf-8'))
  delete tsconfig.extends
  tsconfig.includes?.push('.pikku/**/*')
  if (tsconfig.files?.length === 0) {
    delete tsconfig.files
  }
  fs.writeFileSync(tsconfigFile, JSON.stringify(tsconfig, null, 2))
}

/**
 * Cleans up the pikku.config.json file
 */
export function cleanPikkuConfig(targetPath: string): void {
  const pikkuConfigFile = path.join(targetPath, 'pikku.config.json')
  const pikkuConfig = JSON.parse(fs.readFileSync(pikkuConfigFile, 'utf-8'))
  delete pikkuConfig.extends
  fs.writeFileSync(pikkuConfigFile, JSON.stringify(pikkuConfig, null, 2))
}

/**
 * Applies changes to wranger
 */
export function wranglerChanges(targetPath: string, appName: string): void {
  const wranglerFilePath = path.join(targetPath, 'wrangler.toml')

  if (!fs.existsSync(wranglerFilePath)) return

  let wranglerConfig = fs.readFileSync(wranglerFilePath, 'utf-8')
  const currentDate = new Date().toISOString().split('T')[0]
  wranglerConfig = wranglerConfig
    .replace(
      /compatibility_date\s*=\s*"\d{4}-\d{2}-\d{2}"/,
      `compatibility_date = "${currentDate}"`
    )
    .replace('pikku-cloudflare-workers', appName)
    .replace('pikku-cloudflare-websockets', appName)
  fs.writeFileSync(wranglerFilePath, wranglerConfig)

  console.log(chalk.green('⚙️ Updated wrangler config...'))
}

/**
 * Applies changes to wranger
 */
export function serverlessChanges(targetPath: string, appName: string): void {
  const serverlessFilePath = path.join(targetPath, 'serverless.yml')

  if (!fs.existsSync(serverlessFilePath)) return

  // Updating compmatability_date
  let serverlessConfigString = fs.readFileSync(serverlessFilePath, 'utf-8')
  serverlessConfigString = serverlessConfigString
    .replace('service: pikku-serverless-example', `service: ${appName}`)
    .replace('service: pikku-serverless-ws-example', `service: ${appName}`)
    .replace(
      'arn:aws:iam::014498637088:policy/PikkuServerlessDB',
      'arn:aws:iam::<account_id>:policy/<database-policy>'
    )
  fs.writeFileSync(serverlessFilePath, serverlessConfigString)

  console.log(chalk.green('⚙️ Updated serverless config...'))
}

/**
 * Maps file patterns to feature types for filtering
 */
const FILE_FEATURE_MAPPING = {
  'channel.': ['channel'],
  'http.': ['http'],
  'http-progressive-enhancement.': ['channel'], // This is for channels as mentioned
  'http-sse.': ['http'],
  'mcp.': ['mcp'],
  'queue-worker.': ['queue'],
  'rpc.': ['http'], // RPC is typically over HTTP
  'scheduled-task.': ['scheduled'],
} as const

/**
 * Filters files in functionsPath based on supported features
 */
export function filterFilesByFeatures(
  functionsPath: string,
  supportedFeatures: string[]
): void {
  const srcPath = path.join(functionsPath, 'src')
  if (!fs.existsSync(srcPath)) return

  const filesToRemove: string[] = []

  fs.readdirSync(srcPath).forEach((file) => {
    const filePath = path.join(srcPath, file)
    if (fs.statSync(filePath).isFile()) {
      let shouldKeepFile = false

      // Check if the file matches any pattern for supported features
      for (const [pattern, features] of Object.entries(FILE_FEATURE_MAPPING)) {
        if (file.includes(pattern)) {
          // Check if any of the file's features are supported
          if (features.some((feature) => supportedFeatures.includes(feature))) {
            shouldKeepFile = true
          }
          break
        }
      }

      // Keep files that don't match any pattern (like services.ts)
      const hasKnownPattern = Object.keys(FILE_FEATURE_MAPPING).some(
        (pattern) => file.includes(pattern)
      )

      if (!hasKnownPattern) {
        shouldKeepFile = true
      }

      if (!shouldKeepFile) {
        filesToRemove.push(filePath)
      }
    }
  })

  // Remove filtered files
  filesToRemove.forEach((filePath) => {
    fs.unlinkSync(filePath)
    console.log(
      chalk.yellow(
        `🗑️  Removed ${path.basename(filePath)} (not needed for this template)`
      )
    )
  })
}

export function updatePackageJSONScripts(
  targetPath: string,
  appName: string,
  packageManager: string,
  supportedFeatures: string[],
  stackblitz?: boolean
): void {
  const packageFilePath = path.join(targetPath, 'package.json')
  let packageJsonString = fs.readFileSync(packageFilePath, 'utf-8')
  packageJsonString = packageJsonString.replaceAll(
    'npm run',
    `${packageManager} run`
  )
  const packageJson = JSON.parse(packageJsonString)
  delete packageJson.scripts.tsc
  delete packageJson.scripts.ncu
  delete packageJson.packageManager

  packageJson.scripts.postinstall = 'pikku all'

  if (!stackblitz) {
    packageJson.scripts.test = packageJson.scripts['test:template']
    delete packageJson.scripts['test:template']
  }

  if (stackblitz) {
    // For stackblitz, create test script based on supported features
    const testCommands: string[] = []
    if (supportedFeatures.includes('http')) {
      testCommands.push('npm run test:http')
    }
    if (supportedFeatures.includes('channel')) {
      testCommands.push('npm run test:websocket')
    }
    if (supportedFeatures.includes('rpc')) {
      testCommands.push('npm run test:rpc')
    }
    packageJson.scripts.test = testCommands.join(' && ')
  }

  if (packageManager === 'yarn') {
    packageJson.packageManager = 'yarn@4.9.2'
  }

  packageJson.scripts.pikku = 'pikku all'

  if (stackblitz) {
    packageJson.scripts.stackblitz =
      "concurrently 'pikku --watch' 'npm run dev'"
    packageJson.stackblitz = {
      startCommand: 'npm run stackblitz',
    }
  }

  packageJson.name = appName
  fs.writeFileSync(packageFilePath, JSON.stringify(packageJson, null, 2))
}
