import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

/**
 * Set on the main package's pass to the root's pikku.config.json. The main
 * package is the same project as the root, so its pass loads the root's
 * settings and keeps only its own directory, `.pikku` and tsconfig.
 */
export const ROOT_CONFIG_ENV = 'PIKKU_ROOT_CONFIG'

/** The only keys a main package's own pikku.config.json may hold. */
export const MAIN_CONFIG_KEYS = new Set(['$schema', 'main'])

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
 * The directories of a project that code is read from: its own directory
 * first, then the `main` package its workspace holds when there is one.
 * Entries are relative to `rootDir`. Discovery never throws here; the loader
 * reports a bad workspace.
 */
export const projectSourceDirs = (rootDir: string): string[] => {
  const main = findMainEntry(rootDir)
  return main ? ['.', main] : ['.']
}

/**
 * Where `pikku all` writes the scaffold (the generated wirings) when
 * `scaffold.pikkuDir` is not set, relative to `rootDir`: under `src/scaffold`
 * of the package that owns the wirings, which is the `main` package when the
 * workspace has one, so the files sit where its dependencies resolve.
 */
export const defaultScaffoldDir = (rootDir: string): string =>
  join(findMainEntry(rootDir) ?? '.', 'src', 'scaffold')

/**
 * The file that exports a project's `createConfig`: `src/config.ts` (or `.js`)
 * of the first directory in `dirs` that has one, then `config.ts` at its top.
 * The main package is searched before the project's own directory, because it is
 * the package that owns the services. A `config.ts` at `rootDir` is the last
 * resort.
 */
export const findConfigFactoryFile = (
  rootDir: string,
  dirs: string[]
): string | null => {
  const candidates = [...dirs]
    .reverse()
    .flatMap((dir) =>
      ['src', '.'].flatMap((sub) =>
        ['config.ts', 'config.js'].map((name) =>
          resolve(rootDir, dir, sub, name)
        )
      )
    )
  candidates.push(
    ...['config.ts', 'config.js'].map((name) => join(rootDir, name))
  )
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

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

/** An addon package found in a project's workspace. */
export type AddonPackage = {
  /** The directory relative to the project root, as the workspace lists it. */
  entry: string
  /** The directory, absolute. */
  dir: string
  /** The package.json name. */
  name: string
  /** The package names this package depends on, whether or not they are workspace members. */
  dependsOn: string[]
}

/** The package marked `"main": true`: the one that owns the wirings and services. */
export type MainPackage = { entry: string; dir: string; name: string }

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

/** Whether `dir` is not `root` or something below it. */
const escapes = (root: string, dir: string): boolean => {
  const inside = relative(root, dir)
  return inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)
}

const readJsonSync = (file: string): Record<string, unknown> => {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

const workspacePatterns = (pkg: Record<string, unknown>): string[] => {
  const ws = pkg.workspaces
  const list = Array.isArray(ws)
    ? ws
    : ws && typeof ws === 'object'
      ? (ws as { packages?: unknown }).packages
      : undefined
  return Array.isArray(list)
    ? list.filter((p): p is string => typeof p === 'string')
    : []
}

const isDirectoryTarget = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

const segmentMatcher = (segment: string): RegExp =>
  new RegExp(
    `^${segment
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`
  )

/** The directories a workspace pattern (`packages/*`, `apps/**`, `tools/cli`) names. */
const expandWorkspacePattern = (rootDir: string, pattern: string): string[] => {
  const segments = pattern
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter((s) => s !== '' && s !== '.')
  const found: string[] = []
  const subdirs = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter(
          (e) =>
            (e.isDirectory() ||
              (e.isSymbolicLink() && isDirectoryTarget(join(dir, e.name)))) &&
            !isSkippedDirectory(e.name)
        )
        .map((e) => e.name)
    } catch {
      return []
    }
  }
  const walk = (dir: string, index: number): void => {
    if (index === segments.length) {
      found.push(dir)
      return
    }
    const segment = segments[index]!
    if (segment === '**') {
      walk(dir, index + 1)
      for (const name of subdirs(dir)) walk(join(dir, name), index)
    } else if (segment.includes('*')) {
      const matcher = segmentMatcher(segment)
      for (const name of subdirs(dir)) {
        if (matcher.test(name)) walk(join(dir, name), index + 1)
      }
    } else if (!isSkippedDirectory(segment)) {
      walk(join(dir, segment), index + 1)
    }
  }
  walk(rootDir, 0)
  return found
}

/**
 * Every workspace member of `rootDir` that has its own pikku.config.json, read
 * from the `workspaces` of `rootDir/package.json`. Dependencies, build output,
 * the generated tree and dot-directories are never matched, and a directory the
 * workspace does not list is never a member, so nested fixtures stay out.
 * Members come back sorted by path.
 */
export const findWorkspaceConfigs = (
  rootDir: string
): { entry: string; dir: string; config: Record<string, unknown> }[] => {
  const patterns = workspacePatterns(
    readJsonSync(join(rootDir, 'package.json'))
  )
  const own = resolve(rootDir)
  const included = new Set<string>()
  for (const pattern of patterns.filter((p) => !p.startsWith('!'))) {
    for (const dir of expandWorkspacePattern(rootDir, pattern)) {
      included.add(resolve(dir))
    }
  }
  for (const pattern of patterns.filter((p) => p.startsWith('!'))) {
    for (const dir of expandWorkspacePattern(rootDir, pattern.slice(1))) {
      included.delete(resolve(dir))
    }
  }
  return [...included]
    .filter((dir) => dir !== own && existsSync(join(dir, CONFIG_FILE)))
    .sort()
    .map((dir) => ({
      entry: relative(own, dir),
      dir,
      config: readJsonSync(join(dir, CONFIG_FILE)),
    }))
}

/**
 * A config marked `main` or `addon` is a package inside a project, not a
 * project root, so it never discovers packages of its own.
 */
export const isMarkedPackage = (config: Record<string, unknown>): boolean =>
  config.main === true || !!config.addon

/**
 * The workspace member marked `"main": true`, relative to `rootDir`, or
 * undefined. It does not validate: it is how checks that only read the raw
 * config find where the code lives.
 */
export const findMainEntry = (rootDir: string): string | undefined => {
  if (isMarkedPackage(readJsonSync(join(rootDir, CONFIG_FILE)))) {
    return undefined
  }
  return findWorkspaceConfigs(rootDir).find(
    (member) => member.config.main === true && !member.config.addon
  )?.entry
}

/**
 * A main package's config only carries `"main": true`: the root config holds
 * every project-wide setting, and the main package's pass reads them there.
 */
export const assertMainConfigIsMarker = (
  config: Record<string, unknown>,
  file: string,
  rootConfigFile: string
): void => {
  const extra = Object.keys(config).filter((key) => !MAIN_CONFIG_KEYS.has(key))
  if (extra.length > 0) {
    throw new PikkuCLIConfigError(
      `${file} sets ${extra.map((key) => `"${key}"`).join(', ')}. A main package's config only carries "main": true; the root ${rootConfigFile} holds every project-wide setting, and the main package's pass reads them from there. Move ${extra.length === 1 ? 'it' : 'them'} to the root config.`
    )
  }
}

/** What a project's workspace holds: its addons, and at most one main package. */
export type WorkspacePackages = {
  addons: AddonPackage[]
  main?: MainPackage
}

/**
 * Finds the packages of a project by the role marker in each workspace
 * member's pikku.config.json: `"main": true` is the package that owns the
 * wirings and services, `"addon": ...` is an addon. Zero or one main is allowed; a project with none is its own main.
 *
 * Refuses a member with neither marker or with both, two mains (naming both),
 * a package.json without a name, a duplicate package, and a member whose real path leaves
 * the project root.
 *
 * `configFile` is the project's pikku.config.json; members resolve against
 * `rootDir`, which is where the project's `package.json` lives.
 */
export const resolveWorkspacePackages = async (
  configFile: string,
  rootDir: string
): Promise<WorkspacePackages> => {
  const own = resolve(rootDir)
  if (isMarkedPackage(readJsonSync(configFile))) return { addons: [] }
  const members = findWorkspaceConfigs(rootDir)
  if (members.length === 0) return { addons: [] }
  if (dirname(own) === own) {
    throw new PikkuCLIConfigError(
      `rootDir in ${configFile} is the filesystem root, so workspace packages cannot be checked. Point rootDir at the project.`
    )
  }
  const addons: AddonPackage[] = []
  const mains: MainPackage[] = []
  for (const member of members) {
    const { entry, dir, config } = member
    if (escapes(realpathSync(own), realpathSync(dir))) {
      throw new PikkuCLIConfigError(
        `The workspace package "${entry}" resolves outside the project root (${own}). Packages must live inside the project.`
      )
    }
    const isMain = config.main === true
    const isAddon = !!config.addon
    if (config.main !== undefined && typeof config.main !== 'boolean') {
      throw new PikkuCLIConfigError(
        `main in ${entry}/${CONFIG_FILE} must be true or false.`
      )
    }
    if (isMain && isAddon) {
      throw new PikkuCLIConfigError(
        `${entry}/${CONFIG_FILE} is marked both "main" and "addon". A package is one or the other: "main": true owns the wirings and services, "addon" is wired by it.`
      )
    }
    if (!isMain && !isAddon) {
      throw new PikkuCLIConfigError(
        `${entry}/${CONFIG_FILE} is a workspace package with no role marker. Add "main": true if it owns the wirings and services, or an "addon" section if it is an addon, or remove the file.`
      )
    }
    const pkg = readJsonSync(join(dir, 'package.json'))
    if (typeof pkg.name !== 'string' || pkg.name === '') {
      throw new PikkuCLIConfigError(
        `The workspace package "${entry}" has a ${CONFIG_FILE} but its package.json has no name. The name orders the packages by their dependencies. Add a "name" to ${entry}/package.json.`
      )
    }
    if (isMain) {
      assertMainConfigIsMarker(config, join(entry, CONFIG_FILE), configFile)
      mains.push({ entry, dir, name: pkg.name })
      continue
    }
    addons.push({
      entry,
      dir,
      name: pkg.name,
      dependsOn: packageDependencyNames(pkg),
    })
  }
  if (mains.length > 1) {
    throw new PikkuCLIConfigError(
      `${mains[0]!.entry} and ${mains[1]!.entry} are both marked "main": true. A project has one main package: the one that owns the wirings and services. Remove the marker from one.`
    )
  }
  const names = new Map<string, string>()
  for (const p of [...mains, ...addons]) {
    const first = names.get(p.name)
    if (first) {
      throw new PikkuCLIConfigError(
        `${first} and ${p.entry} are both the package "${p.name}". Give each package its own name.`
      )
    }
    names.set(p.name, p.entry)
  }
  return { addons, main: mains[0] }
}

/** What a `wireAddon` call declares, as the inspector reports it. */
export type WireAddonDeclaration = {
  package: string
  /** The source file the call is in, absolute. */
  file?: string
}

/**
 * An addon package runs its own pass and joins the root's SDK, but the main
 * package is what wires it: a `wireAddon` in the main package's own source
 * points at the addon's package, under whatever name the call chooses, and may
 * do so more than once. Only the main package's source is read: a `wireAddon`
 * anywhere else in the root does not count.
 *
 * `resolvePackage` names the package a call points at, the way the addon
 * loader resolves it (the package.json name of the resolved directory), so an
 * npm alias counts as the package it installs.
 *
 * A listed addon no call points at is dead weight, and is returned as a warning.
 */
export const checkAddonsWired = (
  configFile: string,
  addons: readonly { entry: string; name: string }[],
  declarations: ReadonlyMap<string, WireAddonDeclaration>,
  mainDir: string,
  resolvePackage: (declaration: WireAddonDeclaration) => string = (d) =>
    d.package
): string[] => {
  const own = resolve(mainDir)
  const wired = new Set(
    [...declarations]
      .filter(
        ([, declaration]) =>
          declaration.file === undefined ||
          !escapes(own, resolve(declaration.file))
      )
      .map(([, declaration]) => resolvePackage(declaration))
  )
  return addons
    .filter((addon) => !wired.has(addon.name))
    .map(
      (addon) =>
        `The workspace of ${configFile} has the addon "${addon.entry}", but no wireAddon in the main package's source points at ${addon.name}. Expected wireAddon({ name: '<name>', package: '${addon.name}' }); until it is wired, the addon's functions are not callable from the app. Add it, or remove the addon package.`
    )
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
        `The addon packages of ${configFile} have a dependency cycle: ${cycle.map((p) => p.entry).join(' -> ')}. Remove one of the dependencies.`
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
