import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { glob } from 'tinyglobby'
import semver from 'semver'
import { pikkuSessionlessFunc } from '#pikku'

export type PackageManager = 'bun' | 'npm' | 'yarn' | 'pnpm' | 'unknown'

export type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'

export type UpdateStatus =
  | 'current'
  | 'outdated'
  | 'stale-install'
  | 'linked'
  | 'manual'
  | 'unresolved'

export type UpdateEntry = {
  package: string
  /** package.json holding the range, relative to the project root. */
  manifest: string
  field: DependencyField
  range: string
  /** Version resolved in node_modules, when the project has been installed. */
  installed: string | null
  latest: string | null
  /** The range `--update` would write, or null when there is nothing to write. */
  target: string | null
  status: UpdateStatus
  reason?: string
}

export type PeerFinding = {
  /** The @pikku package that declares the peer. */
  package: string
  peer: string
  required: string
  /** The range the project declares for the peer, or null when it declares none. */
  found: string | null
  resolved: string | null
  manifest: string
  optional: boolean
  /** The range `--update-peers` would write. */
  target: string
}

export type UpdateResult = {
  root: string
  registry: string
  tag: string
  packageManager: PackageManager
  entries: UpdateEntry[]
  peers: PeerFinding[]
  applied: boolean
  /** Manifests rewritten by `--update`, relative to the project root. */
  written: string[]
  installed: boolean
  summary: {
    checked: number
    outdated: number
    staleInstall: number
    linked: number
    manual: number
    unresolved: number
    peerIssues: number
  }
}

export type UpdateInput = {
  update?: boolean
  updatePeers?: boolean
  install?: boolean
  tag?: string
  registry?: string
}

const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

const LOCKFILES: Array<[string, PackageManager]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

/**
 * Ranges we can rewrite without changing what the range *means*: a caret, a
 * tilde, a `>=` floor, or an exact pin. Anything else — a union, an x-range, a
 * `workspace:`/`file:` protocol — is reported and left alone, because moving
 * its floor is a judgement call rather than a substitution.
 */
const SIMPLE_RANGE = /^(\^|~|>=|)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?)$/

/**
 * A range that resolves to a checkout on disk rather than to the registry. The
 * project is deliberately on a local copy, so there is nothing to update and
 * nothing for the user to decide — it is reported apart from the ranges we
 * genuinely cannot rewrite.
 */
const LINK_PROTOCOL = /^(workspace|file|link|portal):/

export type Packument = {
  'dist-tags'?: Record<string, string>
  versions?: Record<
    string,
    {
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
  >
}

export type FetchPackument = (name: string) => Promise<Packument | null>

/** The range `--update` writes for `latest`, or null when the range is not ours to move. */
export const rewriteRange = (range: string, latest: string): string | null => {
  const match = SIMPLE_RANGE.exec(range.trim())
  if (!match) {
    return null
  }
  return `${match[1]}${latest}`
}

/** The lowest version a range admits — what the project is pinned *at least* to. */
const floorOf = (range: string): string | null => {
  try {
    return semver.minVersion(range)?.version ?? null
  } catch {
    return null
  }
}

export const findProjectRoot = (
  startDir: string,
  exists: (path: string) => boolean = existsSync
): string => {
  let dir = resolve(startDir)
  for (let i = 0; i < 12; i++) {
    if (exists(join(dir, 'package.json'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return resolve(startDir)
}

const readJson = (path: string): any | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

const KNOWN_MANAGERS: PackageManager[] = ['bun', 'yarn', 'pnpm', 'npm']

/**
 * Where `install` has to run: the nearest directory at or above the project
 * root that says which package manager owns the tree. In a monorepo that is the
 * workspace root, not the package the command was invoked in.
 *
 * The corepack `packageManager` field wins over lockfiles — it states intent
 * before a lockfile exists, and a project can carry a stale one from another
 * tool. Guessing wrong is not a soft failure: the install spawns a binary that
 * isn't on PATH.
 */
export const findInstallRoot = (
  root: string,
  exists: (path: string) => boolean = existsSync,
  read: (path: string) => any | null = readJson
): { dir: string; packageManager: PackageManager } => {
  let dir = resolve(root)
  for (let i = 0; i < 12; i++) {
    const declared = read(join(dir, 'package.json'))?.packageManager
    const name = typeof declared === 'string' ? declared.split('@')[0] : null
    if (name && (KNOWN_MANAGERS as string[]).includes(name)) {
      return { dir, packageManager: name as PackageManager }
    }
    for (const [file, pm] of LOCKFILES) {
      if (exists(join(dir, file))) {
        return { dir, packageManager: pm }
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return { dir: resolve(root), packageManager: 'unknown' }
}

const workspacePatterns = (manifest: any): string[] => {
  const workspaces = manifest?.workspaces
  if (Array.isArray(workspaces)) {
    return workspaces
  }
  if (Array.isArray(workspaces?.packages)) {
    return workspaces.packages
  }
  return []
}

/** Every package.json the run covers: the project root, plus its workspaces. */
export const collectManifestPaths = async (root: string): Promise<string[]> => {
  const rootManifest = join(root, 'package.json')
  const paths = existsSync(rootManifest) ? [rootManifest] : []
  const patterns = workspacePatterns(readJson(rootManifest))
  if (patterns.length === 0) {
    return paths
  }
  const matches = await glob(
    patterns.map((pattern) => `${pattern.replace(/\/$/, '')}/package.json`),
    { cwd: root, absolute: true, ignore: ['**/node_modules/**'] }
  )
  for (const match of matches.sort()) {
    if (!paths.includes(match)) {
      paths.push(match)
    }
  }
  return paths
}

/** Version resolved in node_modules, walking up from the manifest's own directory. */
export const resolveInstalled = (
  manifestDir: string,
  name: string,
  read: (path: string) => any | null = readJson
): string | null => {
  let dir = resolve(manifestDir)
  for (let i = 0; i < 12; i++) {
    const candidate = read(
      join(dir, 'node_modules', ...name.split('/'), 'package.json')
    )
    if (candidate?.version) {
      return String(candidate.version)
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return null
}

const isPikkuPackage = (name: string) => name.startsWith('@pikku/')

const defaultFetchPackument =
  (registry: string): FetchPackument =>
  async (name) => {
    try {
      const response = await fetch(`${registry.replace(/\/$/, '')}/${name}`, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      })
      if (!response.ok) {
        return null
      }
      return (await response.json()) as Packument
    } catch {
      return null
    }
  }

type ManifestRecord = {
  path: string
  relative: string
  dir: string
  json: any
}

/**
 * Rewrite a manifest's ranges in place, keeping the file's own indentation and
 * key order — a package.json is hand-edited far more often than it is
 * generated, so a version bump must not reformat it.
 */
const writeManifest = (
  path: string,
  edits: Array<{ field: DependencyField; package: string; range: string }>
): void => {
  const raw = readFileSync(path, 'utf-8')
  const json = JSON.parse(raw)
  for (const edit of edits) {
    if (json[edit.field]?.[edit.package] !== undefined) {
      json[edit.field][edit.package] = edit.range
    }
  }
  const indentMatch = raw.match(/\n(\s+)"/)
  const indent = indentMatch ? indentMatch[1] : '  '
  const trailing = raw.endsWith('\n') ? '\n' : ''
  writeFileSync(
    path,
    `${JSON.stringify(json, null, indent)}${trailing}`,
    'utf-8'
  )
}

export const runUpdate = async ({
  rootDir,
  apply,
  updatePeers,
  install,
  tag,
  registry,
  fetchPackument,
}: {
  rootDir: string
  apply: boolean
  updatePeers: boolean
  install: boolean
  tag: string
  registry: string
  fetchPackument?: FetchPackument
}): Promise<UpdateResult> => {
  const root = findProjectRoot(rootDir)
  const { dir: installDir, packageManager } = findInstallRoot(root)
  const fetchOne = fetchPackument ?? defaultFetchPackument(registry)

  const manifests: ManifestRecord[] = []
  for (const path of await collectManifestPaths(root)) {
    const json = readJson(path)
    if (json) {
      manifests.push({
        path,
        relative: relative(root, path).split(sep).join('/') || 'package.json',
        dir: dirname(path),
        json,
      })
    }
  }

  const names = new Set<string>()
  for (const manifest of manifests) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest.json[field] ?? {})) {
        if (isPikkuPackage(name)) {
          names.add(name)
        }
      }
    }
  }

  const packuments = new Map<string, Packument | null>()
  await Promise.all(
    [...names].map(async (name) => {
      packuments.set(name, await fetchOne(name))
    })
  )

  const entries: UpdateEntry[] = []
  for (const manifest of manifests) {
    for (const field of DEPENDENCY_FIELDS) {
      const deps: Record<string, string> = manifest.json[field] ?? {}
      for (const [name, range] of Object.entries(deps)) {
        if (!isPikkuPackage(name)) {
          continue
        }
        const installedVersion = resolveInstalled(manifest.dir, name)
        const latest = packuments.get(name)?.['dist-tags']?.[tag] ?? null
        const entry: UpdateEntry = {
          package: name,
          manifest: manifest.relative,
          field,
          range,
          installed: installedVersion,
          latest,
          target: null,
          status: 'current',
        }
        if (LINK_PROTOCOL.test(range.trim())) {
          entry.status = 'linked'
        } else if (!latest) {
          entry.status = 'unresolved'
          entry.reason = `no '${tag}' release found on ${registry}`
        } else {
          const rewritten = rewriteRange(range, latest)
          if (rewritten === null) {
            entry.status = 'manual'
            entry.reason = `'${range}' is not a plain caret, tilde, >= or exact range`
          } else if (rewritten !== range) {
            entry.status = 'outdated'
            entry.target = rewritten
          } else if (installedVersion && semver.lt(installedVersion, latest)) {
            entry.status = 'stale-install'
            entry.reason = 'the range already allows it — run an install'
          }
        }
        entries.push(entry)
      }
    }
  }

  /**
   * Peers are read off the version the run lands on, not the one installed —
   * the point is what the *target* needs. So resolve every @pikku package to
   * its post-update version first, then read that version's peers.
   */
  const targetVersion = (entry: UpdateEntry): string | null =>
    entry.status === 'outdated' || entry.status === 'stale-install'
      ? entry.latest
      : (entry.installed ?? floorOf(entry.range))

  const pikkuTargets = new Map<string, string>()
  for (const entry of entries) {
    const version = targetVersion(entry)
    if (version && semver.valid(version)) {
      const existing = pikkuTargets.get(entry.package)
      if (!existing || semver.gt(version, existing)) {
        pikkuTargets.set(entry.package, version)
      }
    }
  }

  const peers: PeerFinding[] = []
  for (const manifest of manifests) {
    const declared = new Map<
      string,
      { field: DependencyField; range: string }
    >()
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, range] of Object.entries<string>(
        manifest.json[field] ?? {}
      )) {
        if (!declared.has(name)) {
          declared.set(name, { field, range })
        }
      }
    }

    for (const [name] of declared) {
      if (!isPikkuPackage(name)) {
        continue
      }
      const version = pikkuTargets.get(name)
      const versionMeta = version
        ? packuments.get(name)?.versions?.[version]
        : undefined
      for (const [peer, required] of Object.entries(
        versionMeta?.peerDependencies ?? {}
      )) {
        const optional =
          versionMeta?.peerDependenciesMeta?.[peer]?.optional === true
        const found = declared.get(peer)?.range ?? null
        const resolved =
          pikkuTargets.get(peer) ??
          resolveInstalled(manifest.dir, peer) ??
          (found ? floorOf(found) : null)
        if (
          resolved &&
          semver.satisfies(resolved, required, { includePrerelease: true })
        ) {
          continue
        }
        if (!found && optional) {
          continue
        }
        peers.push({
          package: name,
          peer,
          required,
          found,
          resolved,
          manifest: manifest.relative,
          optional,
          target: required,
        })
      }
    }
  }

  const written: string[] = []
  if (apply) {
    for (const manifest of manifests) {
      const edits = entries
        .filter((entry) => entry.manifest === manifest.relative && entry.target)
        .map((entry) => ({
          field: entry.field,
          package: entry.package,
          range: entry.target!,
        }))
      if (updatePeers) {
        for (const peer of peers) {
          if (peer.manifest !== manifest.relative || !peer.found) {
            continue
          }
          const field = DEPENDENCY_FIELDS.find(
            (candidate) => manifest.json[candidate]?.[peer.peer] !== undefined
          )
          if (field) {
            edits.push({ field, package: peer.peer, range: peer.target })
          }
        }
      }
      if (edits.length > 0) {
        writeManifest(manifest.path, edits)
        written.push(manifest.relative)
      }
    }
  }

  let ranInstall = false
  if (apply && install && written.length > 0 && packageManager !== 'unknown') {
    const result = spawnSync(packageManager, ['install'], {
      cwd: installDir,
      stdio: 'inherit',
    })
    if (result.error || result.status !== 0) {
      throw new Error(
        `${packageManager} install failed: ${result.error?.message ?? `exit ${result.status}`}`
      )
    }
    ranInstall = true
  }

  const count = (status: UpdateStatus) =>
    entries.filter((entry) => entry.status === status).length

  return {
    root,
    registry,
    tag,
    packageManager,
    entries,
    peers,
    applied: apply,
    written,
    installed: ranInstall,
    summary: {
      checked: entries.length,
      outdated: count('outdated'),
      staleInstall: count('stale-install'),
      linked: count('linked'),
      manual: count('manual'),
      unresolved: count('unresolved'),
      peerIssues: peers.length,
    },
  }
}

export const pikkuUpdate = pikkuSessionlessFunc<UpdateInput, UpdateResult>({
  func: async ({ config }, input) => {
    const updatePeers = input?.updatePeers === true
    return runUpdate({
      rootDir: config.rootDir,
      apply: input?.update === true || updatePeers,
      updatePeers,
      install: input?.install !== false,
      tag: input?.tag || 'latest',
      registry:
        input?.registry ||
        process.env.npm_config_registry ||
        'https://registry.npmjs.org',
    })
  },
})
