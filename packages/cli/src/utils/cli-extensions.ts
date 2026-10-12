import { createRequire } from 'node:module'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mountCLIExtension } from '@pikku/core/cli'
import type { CLIExtension, CLIMountHandle } from '@pikku/core/cli'
import { pikkuState } from '@pikku/core/state'
import { coreSatisfiesRange } from './assert-single-core-version.js'

export type DiscoveredCLIExtension = {
  packageName: string
  commandName: string
  packageJsonPath: string
  corePeerRange?: string
}

export type CLIExtensionLogger = { warn: (message: string) => void }

type Manifest = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  pikku?: { cli?: { name?: unknown } }
}

const readManifest = (path: string): Manifest | undefined => {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Manifest
  } catch {
    return undefined
  }
}

const findInstalledPackageJson = (
  fromDir: string,
  packageName: string
): string | undefined => {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', packageName, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const packageRootOf = (file: string, packageName: string): string => {
  let dir = dirname(realpathSync(file))
  for (;;) {
    const manifest = readManifest(join(dir, 'package.json'))
    if (manifest?.name === packageName) return dir
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`Could not locate the root of ${packageName} for ${file}`)
    }
    dir = parent
  }
}

export const findOwnPackageDir = (fromUrl: string): string | undefined => {
  let dir = dirname(new URL(fromUrl).pathname)
  for (;;) {
    if (readManifest(join(dir, 'package.json'))?.name === '@pikku/cli') {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export const discoverCLIExtensions = (
  cliPackageDir: string
): DiscoveredCLIExtension[] => {
  const cli = readManifest(join(cliPackageDir, 'package.json'))
  if (!cli) return []
  const names = [
    ...Object.keys(cli.dependencies ?? {}),
    ...Object.keys(cli.optionalDependencies ?? {}),
  ]
  const found: DiscoveredCLIExtension[] = []
  for (const packageName of names) {
    const packageJsonPath = findInstalledPackageJson(cliPackageDir, packageName)
    if (!packageJsonPath) continue
    const manifest = readManifest(packageJsonPath)
    const commandName = manifest?.pikku?.cli?.name
    if (typeof commandName !== 'string' || !commandName) continue
    found.push({
      packageName,
      commandName,
      packageJsonPath,
      corePeerRange: manifest?.peerDependencies?.['@pikku/core'],
    })
  }
  return found
}

export const selectCLIExtensions = (
  argv: string[],
  builtIns: ReadonlySet<string>,
  discovered: DiscoveredCLIExtension[]
): DiscoveredCLIExtension[] => {
  const first = argv.find((arg) => !arg.startsWith('-'))
  if (first === undefined) return discovered
  if (builtIns.has(first)) return []
  return discovered.filter((ext) => ext.commandName === first)
}

export type CoreIdentity = { root: string; version: string }

export const resolveCoreIdentity = (from: string): CoreIdentity | undefined => {
  try {
    const entry = createRequire(from).resolve('@pikku/core/cli')
    const root = packageRootOf(entry, '@pikku/core')
    const version = readManifest(join(root, 'package.json'))?.version
    return version ? { root, version } : undefined
  } catch {
    return undefined
  }
}

export const checkCoreCompatibility = (
  ext: DiscoveredCLIExtension,
  hostCore: CoreIdentity,
  extensionCore: CoreIdentity | undefined
): string | undefined => {
  if (
    ext.corePeerRange &&
    coreSatisfiesRange(hostCore.version, ext.corePeerRange) === false
  ) {
    return `${ext.packageName} requires @pikku/core ${ext.corePeerRange} but the CLI runs @pikku/core ${hostCore.version}. Install matching versions of @pikku/cli and ${ext.packageName}.`
  }
  if (!extensionCore) {
    return `${ext.packageName} cannot resolve @pikku/core, so its functions would register into nothing. Reinstall it next to @pikku/core ${hostCore.version}.`
  }
  if (
    extensionCore.root !== hostCore.root &&
    extensionCore.version !== hostCore.version
  ) {
    return `${ext.packageName} resolves @pikku/core ${extensionCore.version} (${extensionCore.root}) but the CLI runs @pikku/core ${hostCore.version} (${hostCore.root}). Both copies share one pikkuState, so mounting would corrupt it. Run the project-local CLI (npx pikku) or install matching versions.`
  }
  return undefined
}

export type MountCLIExtensionsOptions = {
  argv: string[]
  cliPackageDir: string
  program?: string
  logger?: CLIExtensionLogger
}

export type MountedCLIExtension = {
  packageName: string
  commandName: string
  handle: CLIMountHandle
}

class ExtensionUnavailable extends Error {}

const mountOne = async (
  ext: DiscoveredCLIExtension,
  program: string,
  cliPackageDir: string,
  hostCore: CoreIdentity
): Promise<CLIMountHandle> => {
  const problem = checkCoreCompatibility(
    ext,
    hostCore,
    resolveCoreIdentity(ext.packageJsonPath)
  )
  if (problem) throw new Error(problem)
  let entry: string
  try {
    entry = createRequire(join(cliPackageDir, 'package.json')).resolve(
      `${ext.packageName}/cli`
    )
  } catch {
    throw new ExtensionUnavailable(
      `${ext.packageName} is installed but its ./cli entry is missing; build the package.`
    )
  }
  const mod = (await import(pathToFileURL(entry).href)) as {
    cliExtension?: CLIExtension
  }
  const extension = mod.cliExtension
  if (!extension) {
    throw new Error(`${ext.packageName}/cli does not export cliExtension.`)
  }
  if (extension.name !== ext.commandName) {
    throw new Error(
      `${ext.packageName} declares command "${ext.commandName}" in package.json but its cliExtension is named "${extension.name}".`
    )
  }
  return mountCLIExtension(program, extension)
}

export const mountCLIExtensions = async ({
  argv,
  cliPackageDir,
  program = 'pikku',
  logger = { warn: (message) => process.stderr.write(`${message}\n`) },
}: MountCLIExtensionsOptions): Promise<MountedCLIExtension[]> => {
  const discovered = discoverCLIExtensions(cliPackageDir)
  if (discovered.length === 0) return []
  const programMeta = pikkuState(null, 'cli', 'meta').programs?.[program]
  const builtIns = new Set(Object.keys(programMeta?.commands ?? {}))
  const selected = selectCLIExtensions(argv, builtIns, discovered)
  if (selected.length === 0) return []
  const hostCore = resolveCoreIdentity(join(cliPackageDir, 'package.json'))
  if (!hostCore) return []
  const named = argv.some((arg) => !arg.startsWith('-'))
  const mounted: MountedCLIExtension[] = []
  for (const ext of selected) {
    try {
      const handle = await mountOne(ext, program, cliPackageDir, hostCore)
      mounted.push({
        packageName: ext.packageName,
        commandName: ext.commandName,
        handle,
      })
    } catch (error: any) {
      if (error instanceof ExtensionUnavailable && !named) continue
      if (named) throw error
      logger.warn(`Skipped the "${ext.commandName}" commands: ${error.message}`)
    }
  }
  return mounted
}
