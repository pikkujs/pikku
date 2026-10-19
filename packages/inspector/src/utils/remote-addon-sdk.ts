import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/** Committed beside pikku.config.json: the SDK version and integrity each versioned `wireRemoteAddon` resolved to. */
export const ADDONS_LOCK_FILE = 'pikku-addons.lock'
/** Where `pikku addon sync` extracts SDKs, relative to the project root. Gitignored with the rest of `.pikku`. */
export const REMOTE_SDK_DIR = join('.pikku', 'remote')
/** Written into an extracted SDK: the integrity of the tarball it came from. */
export const SDK_INTEGRITY_MARKER = '.integrity'

export type AddonsLockEntry = {
  /** The range the spec asked for when this entry was written. */
  range: string
  version: string
  /** `sha512-<base64>` of the SDK tarball. */
  integrity: string
}

export type AddonsLock = {
  lockfileVersion: 1
  sdks: Record<string, AddonsLockEntry>
}

/** `manifest.json` at the root of an SDK. */
export type RemoteAddonSdkManifest = {
  name: string
  version: string
  /** The @pikku/core range the SDK's types were generated against. */
  pikkuCore?: string
  contractHash?: string
}

export type RemoteAddonPackageSpec = { name: string; range?: string }

/**
 * `@scope/name@^1.4.0` → name and range, split at the last `@` after the first
 * character. Mirrors `parseRemoteAddonPackage` in @pikku/core, which the
 * runtime uses on the same literal.
 */
export const parseRemoteAddonPackage = (
  spec: string
): RemoteAddonPackageSpec => {
  const trimmed = spec.trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) {
    if (!trimmed || trimmed === '@') {
      throw new Error(`'${spec}' is not a package name`)
    }
    return { name: trimmed }
  }
  const name = trimmed.slice(0, at)
  const range = trimmed.slice(at + 1).trim()
  if (!range) {
    throw new Error(
      `'${spec}' ends in '@' with no version range after it. Write '${name}@^1.0.0', or drop the '@'.`
    )
  }
  return { name, range }
}

export const emptyAddonsLock = (): AddonsLock => ({
  lockfileVersion: 1,
  sdks: {},
})

/** The project's lock, an empty one when there is none. Throws when the file is not a lock. */
export const readAddonsLock = (rootDir: string): AddonsLock => {
  const path = join(rootDir, ADDONS_LOCK_FILE)
  if (!existsSync(path)) return emptyAddonsLock()
  let parsed: any
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (e: any) {
    throw new Error(`${path} is not valid JSON: ${e?.message ?? e}`)
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.sdks !== 'object'
  ) {
    throw new Error(`${path} has no "sdks" object`)
  }
  return { lockfileVersion: 1, sdks: parsed.sdks ?? {} }
}

/** Sorted by package name, each entry's keys in a fixed order, so the same lock always writes the same bytes. */
export const serializeAddonsLock = (lock: AddonsLock): string => {
  const sdks: Record<string, AddonsLockEntry> = {}
  for (const name of Object.keys(lock.sdks).sort()) {
    const { range, version, integrity } = lock.sdks[name]!
    sdks[name] = { range, version, integrity }
  }
  return `${JSON.stringify({ lockfileVersion: 1, sdks }, null, 2)}\n`
}

export const remoteSdkDir = (
  rootDir: string,
  name: string,
  version: string
): string => join(rootDir, REMOTE_SDK_DIR, `${name}@${version}`)

export const readSdkManifest = (dir: string): RemoteAddonSdkManifest | null => {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'))
  } catch {
    return null
  }
}

export type LockedSdk =
  | {
      ok: true
      entry: AddonsLockEntry
      dir: string
      manifest: RemoteAddonSdkManifest
    }
  | { ok: false; reason: string }

/**
 * Whether the SDK for `name@range` is on disk exactly as the lock pins it: the
 * lock was written for this range, the extracted directory carries the lock's
 * integrity, and its manifest names this package and version.
 */
export const checkLockedSdk = (
  rootDir: string,
  name: string,
  range: string,
  lock: AddonsLock = readAddonsLock(rootDir)
): LockedSdk => {
  const entry = lock.sdks[name]
  if (!entry) {
    return { ok: false, reason: `${ADDONS_LOCK_FILE} has no entry for it` }
  }
  if (entry.range !== range) {
    return {
      ok: false,
      reason: `${ADDONS_LOCK_FILE} was resolved for '${entry.range}', not '${range}'`,
    }
  }
  const dir = remoteSdkDir(rootDir, name, entry.version)
  let integrity: string | null = null
  try {
    integrity = readFileSync(join(dir, SDK_INTEGRITY_MARKER), 'utf-8').trim()
  } catch {
    return { ok: false, reason: `${dir} is missing` }
  }
  if (integrity !== entry.integrity) {
    return {
      ok: false,
      reason: `${dir} was extracted from a different tarball than ${ADDONS_LOCK_FILE} pins`,
    }
  }
  const manifest = readSdkManifest(dir)
  if (
    !manifest ||
    manifest.name !== name ||
    manifest.version !== entry.version
  ) {
    return {
      ok: false,
      reason: `${dir}/manifest.json does not name ${name}@${entry.version}`,
    }
  }
  return { ok: true, entry, dir, manifest }
}
