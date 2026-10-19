import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import semver from 'semver'
import {
  ADDONS_LOCK_FILE,
  ErrorCode,
  SDK_INTEGRITY_MARKER,
  checkLockedSdk,
  emptyAddonsLock,
  readAddonsLock,
  readSdkManifest,
  remoteSdkDir,
  serializeAddonsLock,
  type AddonsLock,
} from '@pikku/inspector/lite'
import { findSourceFiles } from './find-source-files.js'
import { readTgz, writeSdkEntries } from './extract-tgz.js'

/** Where versioned `wireRemoteAddon` packages resolve when `pikku.config.json` sets no `registry`. */
export const DEFAULT_ADDON_REGISTRY = 'https://registry.pikkustudio.app'

/**
 * The registry's resolve endpoint, appended to `registry`. A public pikku RPC,
 * so the body is `{ data: { name, range } }`.
 */
export const RESOLVE_SDK_PATH = '/rpc/registry:resolveSdk'

/** What `registry:resolveSdk` answers: the highest SDK satisfying the range. */
export type ResolvedSdk = {
  version: string
  /** `sha512-<base64>` of the tarball at `url`. */
  integrity: string
  /** A short-lived signed URL for the tarball. Fetched without credentials. */
  url: string
}

export type ResolveSdk = (request: {
  name: string
  range: string
}) => Promise<ResolvedSdk>

export type DownloadSdk = (url: string) => Promise<Buffer>

/** A sync failure carrying the PKU code it is reported under. */
export class RemoteAddonSyncError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'RemoteAddonSyncError'
    this.code = code
  }
}

const isLoopback = (url: URL) =>
  url.hostname === 'localhost' ||
  url.hostname === '127.0.0.1' ||
  url.hostname === '[::1]'

/** True when a credential may be sent to `url`: https, or a local registry. */
const mayCarryCredential = (url: URL) =>
  url.protocol === 'https:' || isLoopback(url)

/**
 * The bearer for the registry: the Pikku Studio login the CLI already holds,
 * else `PIKKU_REGISTRY_TOKEN`. Null when there is neither, and public SDKs
 * still resolve.
 */
export const resolveRegistryToken = async (): Promise<string | null> => {
  try {
    const { resolveApiContext } = await import('@pikku/addon-cloud-cli/client')
    const { token } = await resolveApiContext({ resolveProject: false })
    if (token) return token
  } catch {
    // No login, or an api url the cloud client refuses: fall through.
  }
  return process.env.PIKKU_REGISTRY_TOKEN?.trim() || null
}

/** `resolveSdk` and `download` against a registry over HTTP. */
export const createRegistryClient = ({
  registry,
  token,
  fetch = globalThis.fetch,
}: {
  registry: string
  token: string | null
  fetch?: typeof globalThis.fetch
}): { resolveSdk: ResolveSdk; download: DownloadSdk } => {
  const endpoint = new URL(`${registry.replace(/\/+$/, '')}${RESOLVE_SDK_PATH}`)
  return {
    resolveSdk: async ({ name, range }) => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      }
      if (token && mayCarryCredential(endpoint)) {
        headers.authorization = `Bearer ${token}`
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: { name, range } }),
      })
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300)
        throw new Error(
          `${endpoint.origin} could not resolve ${name}@${range}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`
        )
      }
      const body: any = await response.json()
      if (
        typeof body?.version !== 'string' ||
        typeof body?.integrity !== 'string' ||
        typeof body?.url !== 'string'
      ) {
        throw new Error(
          `${endpoint.origin} answered ${name}@${range} without a version, integrity and url`
        )
      }
      return { version: body.version, integrity: body.integrity, url: body.url }
    },
    download: async (url) => {
      const target = new URL(url, endpoint)
      if (target.protocol !== 'https:' && !isLoopback(target)) {
        throw new Error(
          `refusing to download an SDK over ${target.protocol} from ${target.origin}`
        )
      }
      const response = await fetch(target)
      if (!response.ok) {
        throw new Error(
          `downloading ${target.origin}${target.pathname} failed: HTTP ${response.status}`
        )
      }
      return Buffer.from(await response.arrayBuffer())
    },
  }
}

export const sha512Integrity = (data: Buffer): string =>
  `sha512-${createHash('sha512').update(data).digest('base64')}`

/** A versioned `wireRemoteAddon` package found in the source. */
export type RemoteAddonSdkSpec = {
  name: string
  range: string
  /** Where it was found, for messages: `<file>:<line>`. */
  at: string
}

/**
 * Every versioned `wireRemoteAddon` package in the project's source, one per
 * package. Two calls asking the same package for different ranges is an error:
 * the lock holds one SDK per package.
 */
export const collectRemoteAddonSdkSpecs = async (config: {
  rootDir: string
  srcDirectories: string[]
  ignoreFiles: string[]
}): Promise<RemoteAddonSdkSpec[]> => {
  const files = await findSourceFiles(
    config.rootDir,
    config.srcDirectories,
    config.ignoreFiles
  )
  const candidates: { file: string; text: string }[] = []
  for (const file of files) {
    const text = await readFile(file, 'utf-8')
    if (text.includes('wireRemoteAddon')) candidates.push({ file, text })
  }
  if (candidates.length === 0) return []
  // The scanner needs the compiler; load it only when a file mentions the wiring.
  const { findWireRemoteAddonSpecs } = await import('@pikku/inspector')
  const byName = new Map<string, RemoteAddonSdkSpec>()
  for (const { file, text } of candidates.sort((a, b) =>
    a.file.localeCompare(b.file)
  )) {
    for (const found of findWireRemoteAddonSpecs(file, text)) {
      if (!found.range) continue
      const at = `${relative(config.rootDir, file)}:${found.line}`
      const seen = byName.get(found.name)
      if (seen && seen.range !== found.range) {
        throw new RemoteAddonSyncError(
          ErrorCode.REMOTE_ADDON_PACKAGE_INVALID,
          `${found.name} is wired at '${seen.range}' (${seen.at}) and at '${found.range}' (${at}). ${ADDONS_LOCK_FILE} holds one SDK per package; use the same range in both.`
        )
      }
      if (!seen)
        byName.set(found.name, { name: found.name, range: found.range, at })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The installed @pikku/core version, walking up from `rootDir`. */
const installedCoreVersion = (rootDir: string): string | null => {
  let dir = resolve(rootDir)
  for (;;) {
    const path = join(dir, 'node_modules', '@pikku', 'core', 'package.json')
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, 'utf-8')).version ?? null
      } catch {
        return null
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export type SyncedSdk = {
  name: string
  range: string
  version: string
  /** `cached`: the lock and files matched, nothing was fetched. */
  source: 'cached' | 'downloaded'
  dir: string
  pikkuCore?: string
}

export type SyncResult = {
  sdks: SyncedSdk[]
  lock: AddonsLock
  /** Whether `pikku-addons.lock` was rewritten. */
  lockChanged: boolean
}

export type SyncLogger = {
  debug: (message: string) => void
  info: (message: string) => void
  diagnostic: (d: {
    severity: 'warn' | 'error' | 'critical'
    code: ErrorCode
    message: string
  }) => void
}

/** Downloads `url`, checks it against `integrity`, and extracts it into the SDK directory. */
const fetchAndExtract = async (
  rootDir: string,
  name: string,
  version: string,
  integrity: string,
  url: string,
  download: DownloadSdk
): Promise<string> => {
  if (!integrity.startsWith('sha512-')) {
    throw new RemoteAddonSyncError(
      ErrorCode.REMOTE_ADDON_SDK_INTEGRITY_MISMATCH,
      `The registry gave ${name}@${version} the integrity '${integrity}', which is not a sha512 digest. Refusing to install it.`
    )
  }
  const tarball = await download(url)
  const actual = sha512Integrity(tarball)
  if (actual !== integrity) {
    throw new RemoteAddonSyncError(
      ErrorCode.REMOTE_ADDON_SDK_INTEGRITY_MISMATCH,
      `The SDK tarball downloaded for ${name}@${version} hashes to ${actual}, not the ${integrity} it was published with. Nothing was installed.`
    )
  }
  const dir = remoteSdkDir(rootDir, name, version)
  const staging = `${dir}.partial-${process.pid}`
  await rm(staging, { recursive: true, force: true })
  try {
    await mkdir(staging, { recursive: true })
    await writeSdkEntries(readTgz(tarball), staging)
    const manifest = readSdkManifest(staging)
    if (!manifest || manifest.name !== name || manifest.version !== version) {
      throw new RemoteAddonSyncError(
        ErrorCode.REMOTE_ADDON_SDK_INTEGRITY_MISMATCH,
        `The SDK tarball for ${name}@${version} has a manifest.json naming ${manifest ? `${manifest.name}@${manifest.version}` : 'nothing'}. Nothing was installed.`
      )
    }
    await writeFile(join(staging, SDK_INTEGRITY_MARKER), `${integrity}\n`)
    await rm(dir, { recursive: true, force: true })
    await rename(staging, dir)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return dir
}

/**
 * Brings `.pikku/remote` and `pikku-addons.lock` in line with `specs`.
 *
 * A locked version that still satisfies the spec's range is kept: when its
 * files are on disk with the lock's integrity nothing touches the network,
 * and otherwise the registry is asked for exactly that version and must serve
 * the same bytes. A range the lock cannot satisfy resolves afresh. Entries for
 * packages no longer wired are dropped, and the lock is written sorted, so an
 * unchanged project rewrites nothing.
 */
export const syncRemoteAddonSdks = async ({
  rootDir,
  specs,
  resolveSdk,
  download,
  logger,
  coreVersion = installedCoreVersion(rootDir),
}: {
  rootDir: string
  specs: RemoteAddonSdkSpec[]
  resolveSdk: ResolveSdk
  download: DownloadSdk
  logger: SyncLogger
  coreVersion?: string | null
}): Promise<SyncResult> => {
  let previous: AddonsLock
  try {
    previous = readAddonsLock(rootDir)
  } catch (e: any) {
    throw new RemoteAddonSyncError(
      ErrorCode.REMOTE_ADDON_PACKAGE_INVALID,
      `${e?.message ?? e}. Delete it and run 'pikku all' to write a fresh one.`
    )
  }
  const lock = emptyAddonsLock()
  const sdks: SyncedSdk[] = []

  for (const spec of specs) {
    const { name, range } = spec
    if (!semver.validRange(range)) {
      throw new RemoteAddonSyncError(
        ErrorCode.REMOTE_ADDON_PACKAGE_INVALID,
        `${name}@${range} (${spec.at}) is not a valid semver range. Write e.g. '${name}@^1.0.0'.`
      )
    }
    const pinned = previous.sdks[name]
    let version: string
    let integrity: string
    let dir: string
    let source: SyncedSdk['source']

    if (pinned && semver.satisfies(pinned.version, range)) {
      version = pinned.version
      integrity = pinned.integrity
      const onDisk = checkLockedSdk(rootDir, name, pinned.range, previous)
      if (onDisk.ok) {
        dir = onDisk.dir
        source = 'cached'
      } else {
        const resolved = await resolveSdk({ name, range: pinned.version })
        if (
          resolved.version !== pinned.version ||
          resolved.integrity !== pinned.integrity
        ) {
          throw new RemoteAddonSyncError(
            ErrorCode.REMOTE_ADDON_SDK_INTEGRITY_MISMATCH,
            `${ADDONS_LOCK_FILE} pins ${name}@${pinned.version} at ${pinned.integrity}, but the registry now serves ${resolved.version} at ${resolved.integrity}. Nothing was installed. If the change is expected, remove the ${name} entry from ${ADDONS_LOCK_FILE} and sync again.`
          )
        }
        dir = await fetchAndExtract(
          rootDir,
          name,
          version,
          integrity,
          resolved.url,
          download
        )
        source = 'downloaded'
      }
    } else {
      const resolved = await resolveSdk({ name, range })
      if (
        !semver.valid(resolved.version) ||
        !semver.satisfies(resolved.version, range)
      ) {
        throw new Error(
          `The registry resolved ${name}@${range} to '${resolved.version}', which does not satisfy the range.`
        )
      }
      version = resolved.version
      integrity = resolved.integrity
      dir = await fetchAndExtract(
        rootDir,
        name,
        version,
        integrity,
        resolved.url,
        download
      )
      source = 'downloaded'
    }

    lock.sdks[name] = { range, version, integrity }
    const manifest = readSdkManifest(dir)
    const pikkuCore = manifest?.pikkuCore
    if (
      pikkuCore &&
      coreVersion &&
      semver.validRange(pikkuCore) &&
      !semver.satisfies(coreVersion, pikkuCore, { includePrerelease: true })
    ) {
      logger.diagnostic({
        severity: 'warn',
        code: ErrorCode.REMOTE_ADDON_SDK_CORE_MISMATCH,
        message: `The ${name}@${version} SDK was generated against @pikku/core ${pikkuCore}, but ${coreVersion} is installed. Its types may not line up; update @pikku/core or pin an SDK built for ${coreVersion}.`,
      })
    }
    logger.debug(
      `• ${name}@${range} → ${version} (${source === 'cached' ? 'locked' : 'downloaded'})`
    )
    sdks.push({
      name,
      range,
      version,
      source,
      dir,
      ...(pikkuCore ? { pikkuCore } : {}),
    })
  }

  const next = serializeAddonsLock(lock)
  const lockPath = join(rootDir, ADDONS_LOCK_FILE)
  const current = existsSync(lockPath) ? readFileSync(lockPath, 'utf-8') : null
  // No versioned addons and no lock: write nothing, not an empty lock.
  const lockChanged =
    current !== next && !(current === null && specs.length === 0)
  if (lockChanged) {
    await writeFile(lockPath, next)
  }
  return { sdks, lock, lockChanged }
}

export type AddonSyncConfig = {
  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  registry?: string
}

/**
 * Finds the project's versioned `wireRemoteAddon` packages and syncs their
 * SDKs: the first step of `pikku all`. Null when the project has none and no lock, so nothing ran. The
 * registry client is built only when a spec needs the network.
 */
export const runAddonSync = async ({
  config,
  logger,
  client,
}: {
  config: AddonSyncConfig
  logger: SyncLogger
  client?: { resolveSdk: ResolveSdk; download: DownloadSdk }
}): Promise<SyncResult | null> => {
  const specs = await collectRemoteAddonSdkSpecs({
    ...config,
    ignoreFiles: config.ignoreFiles ?? [],
  })
  if (
    specs.length === 0 &&
    !existsSync(join(config.rootDir, ADDONS_LOCK_FILE))
  ) {
    return null
  }
  let lazy: { resolveSdk: ResolveSdk; download: DownloadSdk } | undefined =
    client
  const registry = async () =>
    (lazy ??= createRegistryClient({
      registry: config.registry ?? DEFAULT_ADDON_REGISTRY,
      token: await resolveRegistryToken(),
    }))
  return syncRemoteAddonSdks({
    rootDir: config.rootDir,
    specs,
    resolveSdk: async (request) => (await registry()).resolveSdk(request),
    download: async (url) => (await registry()).download(url),
    logger,
  })
}
