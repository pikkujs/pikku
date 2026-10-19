import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { glob } from 'tinyglobby'
import semver from 'semver'
import { pikkuSessionlessFunc } from '#pikku/function'
import { checkLockedSdk, readAddonsLock } from '@pikku/inspector/lite'
import { findSourceFiles } from '../../utils/find-source-files.js'
import {
  DEFAULT_ADDON_REGISTRY,
  createRegistryClient,
  resolveRegistryToken,
  type ResolveSdk,
} from '../../utils/remote-addon-sync.js'
import { runAddonSync } from './addon-sync.js'

export type PackageManager = 'bun' | 'npm' | 'yarn' | 'pnpm' | 'unknown'

export type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'
  | 'overrides'
  | 'resolutions'
  /** A versioned `wireRemoteAddon({ package: '@scope/name@^1.4.0' })`; its manifest is the .ts file. */
  | 'wireRemoteAddon'

export type UpdateStatus =
  'current' | 'outdated' | 'stale-install' | 'linked' | 'manual' | 'unresolved'

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
  /** Manifests (and wiring files holding a versioned wireRemoteAddon) rewritten by `--update`, relative to the project root. */
  written: string[]
  installed: boolean
  /** Whether `pikku addon sync` ran after a wireRemoteAddon range was rewritten. */
  addonsSynced?: boolean
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

/**
 * The versioned `wireRemoteAddon` packages `pikku update` checks alongside
 * package.json. Their latest version comes from the addon registry.
 */
export type RemoteAddonUpdateOptions = {
  /** The pikku project root: where pikku-addons.lock and .pikku/remote live. */
  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  /** Answers `{ name, range: '*' }` with the highest published SDK. */
  resolveSdk: ResolveSdk
  /** Runs after `--update` rewrote a spec, to bring the SDKs and lock in line. */
  resync?: () => Promise<unknown>
}

/** The range `resolveSdk` is asked for to find an SDK's latest version. */
export const LATEST_SDK_RANGE = '*'

const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

const VERSIONED_FIELDS: DependencyField[] = [
  ...DEPENDENCY_FIELDS,
  'overrides',
  'resolutions',
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

type RemoteAddonSource = { path: string; relative: string }

/**
 * One entry per versioned `wireRemoteAddon` literal. `installed` is the SDK
 * version pikku-addons.lock pins, when the SDK on disk matches it; when it
 * does not the entry is `stale-install` until `pikku addon sync` runs.
 */
const collectRemoteAddonEntries = async (
  root: string,
  options: RemoteAddonUpdateOptions
): Promise<{
  entries: UpdateEntry[]
  sources: RemoteAddonSource[]
  cores: { name: string; version: string; pikkuCore: string }[]
}> => {
  const files = await findSourceFiles(
    options.rootDir,
    options.srcDirectories,
    options.ignoreFiles ?? []
  )
  const found: { source: RemoteAddonSource; name: string; range: string }[] = []
  for (const path of files.sort()) {
    const text = readFileSync(path, 'utf-8')
    if (!text.includes('wireRemoteAddon')) continue
    const { findWireRemoteAddonSpecs } = await import('@pikku/inspector')
    for (const spec of findWireRemoteAddonSpecs(path, text)) {
      if (!spec.range) continue
      found.push({
        source: {
          path,
          relative: relative(root, path).split(sep).join('/'),
        },
        name: spec.name,
        range: spec.range,
      })
    }
  }
  if (found.length === 0) return { entries: [], sources: [], cores: [] }

  let lock: ReturnType<typeof readAddonsLock> | null = null
  try {
    lock = readAddonsLock(options.rootDir)
  } catch {
    // Reported as stale below; `pikku addon sync` explains what is wrong.
  }
  const latest = new Map<string, string | null>()
  const reasons = new Map<string, string>()
  await Promise.all(
    [...new Set(found.map((spec) => spec.name))].map(async (name) => {
      try {
        const resolved = await options.resolveSdk({
          name,
          range: LATEST_SDK_RANGE,
        })
        latest.set(name, resolved.version)
      } catch (e: any) {
        latest.set(name, null)
        reasons.set(name, e?.message ?? String(e))
      }
    })
  )

  const entries: UpdateEntry[] = []
  const cores = new Map<
    string,
    { name: string; version: string; pikkuCore: string }
  >()
  for (const { source, name, range } of found) {
    const locked = lock
      ? checkLockedSdk(options.rootDir, name, range, lock)
      : ({ ok: false, reason: 'pikku-addons.lock cannot be read' } as const)
    const latestVersion = latest.get(name) ?? null
    const entry: UpdateEntry = {
      package: name,
      manifest: source.relative,
      field: 'wireRemoteAddon',
      range,
      installed: locked.ok ? locked.entry.version : null,
      latest: latestVersion,
      target: null,
      status: 'current',
    }
    if (locked.ok && locked.manifest.pikkuCore) {
      cores.set(name, {
        name,
        version: locked.entry.version,
        pikkuCore: locked.manifest.pikkuCore,
      })
    }
    const rewritten = latestVersion ? rewriteRange(range, latestVersion) : null
    if (!latestVersion) {
      entry.status = 'unresolved'
      entry.reason = `the addon registry did not resolve it${reasons.has(name) ? `: ${reasons.get(name)}` : ''}`
    } else if (rewritten === null) {
      entry.status = 'manual'
      entry.reason = `'${range}' is not a plain caret, tilde, >= or exact range`
    } else if (rewritten !== range) {
      entry.status = 'outdated'
      entry.target = rewritten
    } else if (!locked.ok) {
      entry.status = 'stale-install'
      entry.reason = `${locked.reason} — run \`pikku addon sync\``
    }
    entries.push(entry)
  }
  const sources = [
    ...new Map(found.map(({ source }) => [source.path, source])).values(),
  ]
  return { entries, sources, cores: [...cores.values()] }
}

/**
 * Writes each outdated wireRemoteAddon entry's target range into its
 * `package` literal, keeping the quote style. Returns the files changed.
 */
const rewriteRemoteAddonSpecs = async (
  sources: RemoteAddonSource[],
  entries: UpdateEntry[]
): Promise<string[]> => {
  const written: string[] = []
  for (const source of sources) {
    const targets = new Map(
      entries
        .filter(
          (entry) =>
            entry.field === 'wireRemoteAddon' &&
            entry.manifest === source.relative &&
            entry.target
        )
        .map((entry) => [`${entry.package}@${entry.range}`, entry])
    )
    if (targets.size === 0) continue
    const text = readFileSync(source.path, 'utf-8')
    const { findWireRemoteAddonSpecs } = await import('@pikku/inspector')
    const specs = findWireRemoteAddonSpecs(source.path, text)
    let next = text
    for (const spec of [...specs].sort((a, b) => b.start - a.start)) {
      const entry = spec.range
        ? targets.get(`${spec.name}@${spec.range}`)
        : undefined
      if (!entry) continue
      const quote = text[spec.start]
      next = `${next.slice(0, spec.start)}${quote}${spec.name}@${entry.target}${quote}${next.slice(spec.end)}`
    }
    if (next !== text) {
      writeFileSync(source.path, next, 'utf-8')
      written.push(source.relative)
    }
  }
  return written
}

export const runUpdate = async ({
  rootDir,
  apply,
  updatePeers,
  install,
  tag,
  registry,
  fetchPackument,
  remoteAddons,
}: {
  rootDir: string
  apply: boolean
  updatePeers: boolean
  install: boolean
  tag: string
  registry: string
  fetchPackument?: FetchPackument
  remoteAddons?: RemoteAddonUpdateOptions
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
    for (const field of VERSIONED_FIELDS) {
      for (const [name, range] of Object.entries(manifest.json[field] ?? {})) {
        if (isPikkuPackage(name) && typeof range === 'string') {
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
    for (const field of VERSIONED_FIELDS) {
      const deps: Record<string, unknown> = manifest.json[field] ?? {}
      for (const [name, range] of Object.entries(deps)) {
        if (!isPikkuPackage(name) || typeof range !== 'string') {
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

  const remote = remoteAddons
    ? await collectRemoteAddonEntries(root, remoteAddons)
    : { entries: [], sources: [], cores: [] }
  entries.push(...remote.entries)

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
    if (entry.field === 'wireRemoteAddon') continue
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

  // A remote addon's SDK names the @pikku/core its types were generated
  // against; it is a peer of the project's own @pikku/core.
  const rootManifest = manifests.find((manifest) => manifest.dir === root)
  for (const sdk of remote.cores) {
    const found =
      DEPENDENCY_FIELDS.map(
        (field) => rootManifest?.json[field]?.['@pikku/core']
      ).find((range): range is string => typeof range === 'string') ?? null
    const resolved =
      pikkuTargets.get('@pikku/core') ??
      resolveInstalled(root, '@pikku/core') ??
      (found ? floorOf(found) : null)
    if (
      resolved &&
      semver.validRange(sdk.pikkuCore) &&
      semver.satisfies(resolved, sdk.pikkuCore, { includePrerelease: true })
    ) {
      continue
    }
    peers.push({
      package: `${sdk.name}@${sdk.version}`,
      peer: '@pikku/core',
      required: sdk.pikkuCore,
      found,
      resolved,
      manifest: rootManifest?.relative ?? 'package.json',
      optional: false,
      target: sdk.pikkuCore,
    })
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

  let resynced = false
  if (apply) {
    const rewrittenSources = await rewriteRemoteAddonSpecs(
      remote.sources,
      entries
    )
    written.push(...rewrittenSources)
    if (rewrittenSources.length > 0 && install && remoteAddons?.resync) {
      await remoteAddons.resync()
      resynced = true
    }
  }

  let ranInstall = false
  const manifestsWritten = written.some((path) => path.endsWith('.json'))
  if (apply && install && manifestsWritten && packageManager !== 'unknown') {
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
    ...(remoteAddons ? { addonsSynced: resynced } : {}),
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
  func: async ({ config, logger }, input) => {
    const updatePeers = input?.updatePeers === true
    let client: ReturnType<typeof createRegistryClient> | undefined
    const registryClient = async () =>
      (client ??= createRegistryClient({
        registry: config.registry ?? DEFAULT_ADDON_REGISTRY,
        token: await resolveRegistryToken(),
      }))
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
      remoteAddons: {
        rootDir: config.rootDir,
        srcDirectories: config.srcDirectories,
        ignoreFiles: config.ignoreFiles,
        resolveSdk: async (request) =>
          (await registryClient()).resolveSdk(request),
        resync: () =>
          runAddonSync({
            config,
            logger,
            client: {
              resolveSdk: async (request) =>
                (await registryClient()).resolveSdk(request),
              download: async (url) => (await registryClient()).download(url),
            },
          }),
      },
    })
  },
})
