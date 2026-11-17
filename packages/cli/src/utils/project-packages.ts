import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { parseAddonDependencies } from '@pikku/inspector'
import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

/**
 * Directories a project accumulates that are never its own source: installed
 * dependencies, build output, and the generated tree. Every other directory
 * starting with a dot is skipped as well (see `isSkippedDirectory`).
 */
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.pikku',
  '.pikku-runtime',
  'coverage',
  '.next',
  '.yarn',
])

export const CONFIG_FILE = 'pikku.config.json'

/** What an addon name may be, the rule `pikku new addon` applies. */
export const NAMESPACE_PATTERN = /^[a-z][a-z0-9_-]*$/

export const isSkippedDirectory = (name: string): boolean =>
  SKIP_DIRS.has(name) || name.startsWith('.')

/**
 * A directory below a project root that holds its own pikku.config.json is a
 * project of its own (an addon or a functions package): the project above does
 * not inspect it, it is inspected where it lives.
 */
export const isNestedProject = (dir: string, root: string): boolean =>
  dir !== root && existsSync(join(dir, CONFIG_FILE))

/**
 * The directories of a project that code is read from, as written in a raw
 * pikku.config.json: the project's own directory first, then its `base`
 * package when it names one. Entries are relative to the config's `rootDir`.
 */
export const projectSourceDirs = (config: { base?: unknown }): string[] => [
  '.',
  ...(typeof config.base === 'string' && config.base !== ''
    ? [config.base]
    : []),
]

/**
 * Every file under `dirs` (relative to `root`) whose name ends in one of
 * `extensions`, walking the way the inspector does: build output, dependencies,
 * dot-directories and any nested project are left alone, except where a nested
 * project is itself the directory being walked.
 */
export const listProjectFiles = async (
  root: string,
  dirs: string[],
  extensions: string[]
): Promise<string[]> => {
  const found = new Set<string>()
  const walk = async (dir: string, start: string): Promise<void> => {
    if (isNestedProject(dir, start)) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!isSkippedDirectory(entry.name)) await walk(path, start)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.add(path)
      }
    }
  }
  for (const dir of dirs) {
    const start = resolve(root, dir)
    await walk(start, start)
  }
  return [...found].sort()
}

/** An addon a project lists in `addons`. */
export type AddonPackage = {
  /** The entry as written in the config. */
  entry: string
  /** The directory, absolute. */
  dir: string
  /** The package.json name. */
  name: string
  /** The namespace the package is wired under, from its own pikku.config.json. */
  namespace: string
  /** The package names this package depends on, whether or not they are listed. */
  dependsOn: string[]
}

const readJson = async (file: string): Promise<Record<string, unknown>> => {
  try {
    return JSON.parse(await readFile(file, 'utf-8'))
  } catch {
    return {}
  }
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

/**
 * Every package a package.json depends on: the four dependency fields, and the
 * addons it calls under `pikku.uses`.
 */
export const packageDependencyNames = (
  pkg: Record<string, unknown>
): string[] => {
  const names = new Set<string>()
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field]
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) names.add(name)
    }
  }
  const uses = parseAddonDependencies(
    (pkg.pikku as { uses?: unknown } | undefined)?.uses
  )
  if (uses.form === 'list') for (const name of uses.names) names.add(name)
  if (uses.form === 'map') {
    for (const dependency of uses.dependencies) names.add(dependency.package)
  }
  return [...names]
}

/**
 * Reads each directory a project lists in `addons` and refuses the
 * entries that cannot be built from: not a string, missing, the project's own
 * directory, a directory without its own pikku.config.json or a package.json
 * name, one that itself lists addons or a base, or one that is not an addon.
 *
 * `configFile` is the project's pikku.config.json; entries resolve against its
 * `rootDir`, which is `rootDir`.
 */
export const resolveAddonPackages = async (
  configFile: string,
  rootDir: string,
  entries: unknown
): Promise<AddonPackage[]> => {
  if (entries === undefined) return []
  const where = `addons in ${configFile}`
  if (
    !Array.isArray(entries) ||
    entries.some((e) => typeof e !== 'string' || e === '')
  ) {
    throw new PikkuCLIConfigError(
      `${where} must be a list of directories, each a string. Write each as a path such as "packages/functions".`
    )
  }
  const own = resolve(rootDir)
  const packages: AddonPackage[] = []
  for (const entry of entries as string[]) {
    const dir = resolve(rootDir, entry)
    const label = relative(own, dir) || entry
    if (dir === own) {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", which is this project's own directory. List the packages it builds from, and leave the project itself out.`
      )
    }
    if (!existsSync(dir)) {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", which does not exist. Fix the path or remove the entry.`
      )
    }
    const configPath = join(dir, CONFIG_FILE)
    if (!existsSync(configPath)) {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", which has no ${CONFIG_FILE}. Each listed directory is a Pikku project of its own: add ${label}/${CONFIG_FILE}, or remove the entry.`
      )
    }
    const listedConfig = await readJson(configPath)
    if ('addons' in listedConfig || 'base' in listedConfig) {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", whose ${CONFIG_FILE} sets addons or base itself. List its addons here instead; only one level is supported.`
      )
    }
    if (!listedConfig.addon) {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", which is not an addon: ${label}/${CONFIG_FILE} has no "addon" section. Each entry is an addon. The package that owns the wirings and services is the project's "base".`
      )
    }
    const namespace = listedConfig.namespace
    if (typeof namespace !== 'string' || namespace === '') {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", whose ${CONFIG_FILE} has no namespace. The base wires the addon under that name (\`namespace:function\`). Add "namespace" to ${label}/${CONFIG_FILE}.`
      )
    }
    if (!NAMESPACE_PATTERN.test(namespace)) {
      throw new PikkuCLIConfigError(
        `The namespace "${namespace}" in ${label}/${CONFIG_FILE} is not valid: it must start with a lowercase letter and contain only lowercase alphanumerics, hyphens, and underscores.`
      )
    }
    const pkg = await readJson(join(dir, 'package.json'))
    if (typeof pkg.name !== 'string' || pkg.name === '') {
      throw new PikkuCLIConfigError(
        `${where} lists "${entry}", whose package.json has no name. The name is how the packages are ordered by their dependencies. Add a "name" to ${label}/package.json.`
      )
    }
    packages.push({
      entry,
      dir,
      name: pkg.name,
      namespace,
      dependsOn: packageDependencyNames(pkg),
    })
  }
  const seen = new Map<string, string>()
  for (const p of packages) {
    const first = seen.get(p.name)
    if (first) {
      throw new PikkuCLIConfigError(
        `${where} lists "${first}" and "${p.entry}", which are both the package "${p.name}". List each package once.`
      )
    }
    seen.set(p.name, p.entry)
  }
  const namespaces = new Map<string, string>()
  for (const p of packages) {
    const first = namespaces.get(p.namespace)
    if (first) {
      throw new PikkuCLIConfigError(
        `${where} lists "${first}" and "${p.entry}", which both declare the namespace "${p.namespace}". Give each package its own namespace in its ${CONFIG_FILE}.`
      )
    }
    namespaces.set(p.namespace, p.entry)
  }
  return packages
}

/** The package a project names as its `base`: the one that owns the wirings and services. */
export type BasePackage = { entry: string; dir: string; name: string }

/**
 * Reads the directory a project names as its `base` and refuses what cannot
 * be one: not a single string, missing, the project's own directory, without
 * its own pikku.config.json or package.json name, an addon, or one that sets
 * `addons` or `base` itself. `base` is one package, so a list is refused.
 */
export const resolveBasePackage = async (
  configFile: string,
  rootDir: string,
  entry: unknown,
  addons: AddonPackage[]
): Promise<BasePackage | undefined> => {
  if (entry === undefined) return undefined
  const where = `base in ${configFile}`
  if (typeof entry !== 'string' || entry === '') {
    throw new PikkuCLIConfigError(
      `${where} must be one directory, written as a string such as "packages/functions". A project has at most one base.`
    )
  }
  const own = resolve(rootDir)
  const dir = resolve(rootDir, entry)
  const label = relative(own, dir) || entry
  if (dir === own) {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", this project's own directory. A config without base is its own base: leave the key out.`
    )
  }
  if (!existsSync(dir)) {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", which does not exist. Fix the path or remove the key.`
    )
  }
  const configPath = join(dir, CONFIG_FILE)
  if (!existsSync(configPath)) {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", which has no ${CONFIG_FILE}. The base is a Pikku project of its own: add ${label}/${CONFIG_FILE}.`
    )
  }
  const baseConfig = await readJson(configPath)
  if ('addons' in baseConfig || 'base' in baseConfig) {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", whose ${CONFIG_FILE} sets addons or base itself. Set them in the root config only.`
    )
  }
  if (baseConfig.addon) {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", which is an addon. The base owns the wirings and services; list an addon in "addons" instead.`
    )
  }
  const pkg = await readJson(join(dir, 'package.json'))
  if (typeof pkg.name !== 'string' || pkg.name === '') {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", whose package.json has no name. Add a "name" to ${label}/package.json.`
    )
  }
  if (addons.some((a) => a.dir === dir)) {
    throw new PikkuCLIConfigError(
      `${where} is "${entry}", which is also listed in addons. A directory is the base or an addon, not both.`
    )
  }
  return { entry, dir, name: pkg.name }
}

/**
 * An addon in `addons` runs its own pass and joins the root's SDK, but the
 * base is what wires it: a `wireAddon` in the base's source names it, with the
 * addon's `namespace`. One the base never wires is dead weight, or a typo.
 */
export const assertAddonsWired = (
  configFile: string,
  addons: readonly { entry: string; namespace: string }[],
  wired: Iterable<string>
): void => {
  const names = new Set(wired)
  for (const addon of addons) {
    if (!names.has(addon.namespace)) {
      throw new PikkuCLIConfigError(
        `addons in ${configFile} lists "${addon.entry}", but no wireAddon names its namespace "${addon.namespace}" in the base package's source. Add wireAddon({ name: '${addon.namespace}', package: ... }) there, or remove it from addons.`
      )
    }
  }
}

/**
 * The packages in the order they must be built: a package after every listed
 * package it depends on. Kahn's algorithm, with ties kept in the order the
 * entries were listed. A dependency on a package that is not listed is not an
 * ordering constraint.
 */
export const orderAddonPackages = (
  packages: AddonPackage[],
  configFile: string
): AddonPackage[] => {
  const byName = new Map(packages.map((p) => [p.name, p]))
  const pending = new Map<AddonPackage, Set<AddonPackage>>(
    packages.map((p) => [
      p,
      new Set(
        p.dependsOn
          .map((name) => byName.get(name))
          .filter((d): d is AddonPackage => !!d && d !== p)
      ),
    ])
  )
  const ordered: AddonPackage[] = []
  while (pending.size > 0) {
    const next = packages.find((p) => pending.get(p)?.size === 0)
    if (!next) {
      const cycle = findCycle(pending)
      throw new PikkuCLIConfigError(
        `addons in ${configFile} has a dependency cycle: ${cycle.map((p) => p.entry).join(' -> ')}. Remove one of the dependencies.`
      )
    }
    ordered.push(next)
    pending.delete(next)
    for (const deps of pending.values()) deps.delete(next)
  }
  return ordered
}

/** A path through the packages still waiting that ends where it began. */
const findCycle = (
  pending: Map<AddonPackage, Set<AddonPackage>>
): AddonPackage[] => {
  const path: AddonPackage[] = []
  let current = [...pending.keys()][0]!
  while (!path.includes(current)) {
    path.push(current)
    current = [...pending.get(current)!][0]!
  }
  return [...path.slice(path.indexOf(current)), current]
}
