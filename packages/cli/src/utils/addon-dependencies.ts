import { readFileSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import semver from 'semver'
import {
  ErrorCode,
  addonResolutionDirs,
  checkLockedSdk,
  findInstalledPackageDir,
  readAddonDependencies,
  readAddonsLock,
  readSdkManifest,
  type AddonDependency,
  type AddonsLock,
} from '@pikku/inspector/lite'
import type { RemoteAddonSdkSpec } from './remote-addon-sync.js'

/**
 * Where the types of an addon this addon calls come from: a package in the
 * same workspace has generated its own SDK, which is read in place; anything
 * else is fetched from the registry and pinned in `pikku-addons.lock`, the
 * same way an app syncs a versioned `wireRemoteAddon`.
 *
 * knowledge: an-addon-calls-another-through-its-sdk
 */
export type ResolvedAddonDependency = AddonDependency &
  (
    | { source: 'registry' }
    | { source: 'workspace'; packageDir: string; sdkDir: string }
  )

export type AddonDependencyDiagnostic = { code: ErrorCode; message: string }

/** A workspace package is linked from its source, not installed into a store. */
const workspacePackageDir = (
  rootDir: string,
  packageName: string
): string | null => {
  const installed = findInstalledPackageDir([rootDir], packageName)
  if (!installed) return null
  const real = realpathSync(installed)
  return real.split(sep).includes('node_modules') ? null : real
}

/** `<package>/<outDir>/sdk`, where an addon's `pikku all` writes its SDK. */
const workspaceSdkDir = (packageDir: string): string => {
  let outDir = '.pikku'
  try {
    const config = JSON.parse(
      readFileSync(join(packageDir, 'pikku.config.json'), 'utf-8')
    )
    if (typeof config?.outDir === 'string') outDir = config.outDir
  } catch {
    // No readable pikku.config.json: the default outDir.
  }
  return join(packageDir, outDir, 'sdk')
}

/**
 * The addons the addon at `rootDir` declares under `pikku.uses` in its
 * package.json, each with where its SDK comes from. Only the
 * `{ alias: 'package@range' }` form names a range to resolve; an addon that
 * lists plain names, or declares nothing, has no dependencies to sync.
 */
export const resolveAddonDependencies = (
  rootDir: string
): ResolvedAddonDependency[] => {
  const declared = readAddonDependencies(rootDir)
  if (declared.form !== 'map') return []
  return declared.dependencies.map((dependency) => {
    const packageDir = workspacePackageDir(rootDir, dependency.package)
    return packageDir
      ? {
          ...dependency,
          source: 'workspace' as const,
          packageDir,
          sdkDir: workspaceSdkDir(packageDir),
        }
      : { ...dependency, source: 'registry' as const }
  })
}

/** The registry SDKs an addon's dependencies need, as sync specs. */
export const addonDependencySdkSpecs = (
  dependencies: ResolvedAddonDependency[]
): RemoteAddonSdkSpec[] =>
  dependencies
    .filter((d) => d.source === 'registry')
    .map((d) => ({
      name: d.package,
      range: d.range,
      at: `package.json pikku.uses.${d.alias}`,
    }))

/**
 * What is wrong with a workspace dependency's SDK: not generated yet, generated
 * for another package, or at a version the declared range does not accept.
 */
export const checkWorkspaceDependencySdks = (
  dependencies: ResolvedAddonDependency[]
): AddonDependencyDiagnostic[] => {
  const problems: AddonDependencyDiagnostic[] = []
  for (const d of dependencies) {
    if (d.source !== 'workspace') continue
    const manifest = readSdkManifest(d.sdkDir)
    if (!manifest || manifest.name !== d.package) {
      problems.push({
        code: ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY,
        message: `pikku.uses.${d.alias} names ${d.package}, which is in this workspace at ${d.packageDir} but has no SDK at ${d.sdkDir}. Run 'pikku all' in ${d.packageDir} first.`,
      })
      continue
    }
    if (
      !semver.valid(manifest.version) ||
      !semver.satisfies(manifest.version, d.range, { includePrerelease: true })
    ) {
      problems.push({
        code: ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH,
        message: `pikku.uses.${d.alias} asks for ${d.package}@${d.range}, but the workspace copy at ${d.packageDir} is ${manifest.version}.`,
      })
    }
  }
  return problems
}

/** A dependency's SDK in a shape the typed-map serializers import from. */
export type AddonDependencyDeclaration = {
  package: string
  range: string
  remote: true
  sdkDir?: string
}

/**
 * The dependencies whose SDK is ready, by alias, for the typed RPC, workflow
 * and agent maps: `rpc.invoke('<alias>:<fn>')` then types against the
 * dependency's remote surface whichever way the app that wires this addon
 * provides it. One whose SDK is missing is left out, and has been reported.
 */
export const addonDependencyDeclarations = (
  rootDir: string,
  dependencies: ResolvedAddonDependency[] = resolveAddonDependencies(rootDir)
): Map<string, AddonDependencyDeclaration> => {
  const declarations = new Map<string, AddonDependencyDeclaration>()
  let lock: AddonsLock | undefined
  for (const d of dependencies) {
    if (d.source === 'workspace') {
      if (readSdkManifest(d.sdkDir)?.name !== d.package) continue
      declarations.set(d.alias, {
        package: d.package,
        range: d.range,
        remote: true,
        sdkDir: d.sdkDir,
      })
      continue
    }
    try {
      lock ??= readAddonsLock(rootDir)
    } catch {
      continue
    }
    if (!checkLockedSdk(rootDir, d.package, d.range, lock).ok) continue
    declarations.set(d.alias, {
      package: d.package,
      range: d.range,
      remote: true,
    })
  }
  return declarations
}

type WiredAddon = {
  package: string
  file?: string
  remote?: boolean
  range?: string
  uses?: Record<string, string>
  dependencies?: AddonDependency[]
}

const installedVersion = (
  rootDir: string,
  wired: WiredAddon
): string | null => {
  const dir = findInstalledPackageDir(
    addonResolutionDirs(rootDir, wired.file),
    wired.package
  )
  if (!dir) return null
  try {
    return (
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')).version ??
      null
    )
  } catch {
    return null
  }
}

/**
 * The version of `wired` this app runs: the version `pikku-addons.lock` pins
 * for a versioned `wireRemoteAddon`, else the installed package's.
 */
const wiredVersion = (
  rootDir: string,
  wired: WiredAddon,
  lock: () => AddonsLock | null
): string | null => {
  if (wired.remote && wired.range) {
    return lock()?.sdks[wired.package]?.version ?? null
  }
  return installedVersion(rootDir, wired)
}

/**
 * For every wired addon that declares `{ alias: 'package@range' }`, whether the
 * instance the app maps the alias to is a version the range accepts. A version
 * that cannot be read fails too: the check is there to stop an addon running
 * against a contract it was not written for, and "unknown" is not a yes.
 * Mappings that are missing, undeclared or to another package are the
 * inspector's (PKU348, PKU355, PKU347) and are skipped here.
 */
export const checkAddonDependencyVersions = (
  rootDir: string,
  wireAddonDeclarations: Map<string, WiredAddon>
): AddonDependencyDiagnostic[] => {
  const problems: AddonDependencyDiagnostic[] = []
  let cachedLock: AddonsLock | null | undefined
  const lock = () => {
    if (cachedLock === undefined) {
      try {
        cachedLock = readAddonsLock(rootDir)
      } catch {
        cachedLock = null
      }
    }
    return cachedLock
  }
  for (const [namespace, decl] of wireAddonDeclarations) {
    for (const dependency of decl.dependencies ?? []) {
      const target = decl.uses?.[dependency.alias]
      const wired = target ? wireAddonDeclarations.get(target) : undefined
      if (!target || !wired || wired.package !== dependency.package) continue
      if (!semver.validRange(dependency.range)) {
        problems.push({
          code: ErrorCode.ADDON_DEPENDENCY_INVALID,
          message: `${decl.package} (wired as '${namespace}') declares pikku.uses.${dependency.alias} as ${dependency.package}@${dependency.range}, which is not a valid semver range.`,
        })
        continue
      }
      const version = wiredVersion(rootDir, wired, lock)
      if (
        version &&
        semver.valid(version) &&
        semver.satisfies(version, dependency.range, {
          includePrerelease: true,
        })
      ) {
        continue
      }
      problems.push({
        code: ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH,
        message: version
          ? `Addon '${namespace}' (${decl.package}) calls ${dependency.package}@${dependency.range} as '${dependency.alias}', but '${target}' is ${dependency.package}@${version}. Wire a version the range accepts, or upgrade ${decl.package}.`
          : `Addon '${namespace}' (${decl.package}) calls ${dependency.package}@${dependency.range} as '${dependency.alias}', but the version of '${target}' cannot be read${wired.remote && wired.range ? ` from pikku-addons.lock; run 'pikku all'` : `: ${dependency.package} is not installed where '${target}' is wired`}.`,
      })
    }
  }
  return problems
}

/**
 * The declarations the typed maps import from: the app's own wirings and, in
 * an addon, its dependencies by alias. A wiring keeps its name over an alias.
 */
export const withAddonDependencies = <D>(
  config: { rootDir: string; addon?: unknown },
  wireAddonDeclarations: Map<string, D> | undefined
): Map<string, D | AddonDependencyDeclaration> | undefined => {
  if (!config.addon) return wireAddonDeclarations
  const dependencies = addonDependencyDeclarations(config.rootDir)
  if (dependencies.size === 0) return wireAddonDeclarations
  const merged = new Map<string, D | AddonDependencyDeclaration>(
    wireAddonDeclarations
  )
  for (const [alias, declaration] of dependencies) {
    if (!merged.has(alias)) merged.set(alias, declaration)
  }
  return merged
}
