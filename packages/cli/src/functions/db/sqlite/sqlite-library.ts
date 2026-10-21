import { existsSync, realpathSync } from 'node:fs'

/**
 * Which SQLite library bun opens databases with, on the one platform where
 * that is a choice.
 *
 * Bun on macOS links Apple's system SQLite, which is built without extension
 * loading, so sqlite-vec and every other `db.sqliteExtensions` entry would be
 * refused there. `Database.setCustomSQLite` swaps in another libsqlite3 — once,
 * and only before the first database is opened — so the CLI does it as the
 * process starts, and a bun standalone build carries the same library inside
 * the artifact.
 *
 * Elsewhere there is nothing to do: bun on Linux statically links a SQLite that
 * loads extensions, and `setCustomSQLite` there is a no-op that still reports
 * success. Node's `node:sqlite` brings its own SQLite on every platform.
 */

/** Names a libsqlite3 to use instead of looking in the usual places. */
export const SQLITE_LIBRARY_ENV = 'PIKKU_SQLITE_LIBRARY'

/** Homebrew's `sqlite` formula, Apple silicon then Intel. */
const MACOS_CANDIDATES = [
  '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib',
  '/usr/local/opt/sqlite/lib/libsqlite3.dylib',
]

export type SqliteLibraryLookup =
  { path: string; reason?: undefined } | { path?: undefined; reason: string }

/**
 * Find the libsqlite3 to load on this platform, or say why there is none.
 *
 * `platform` is the target's: the host's for the CLI itself, and the compile
 * target's for a standalone build.
 * Symlinks are resolved so a copy staged into an artifact is the library, not a
 * dangling link to it.
 */
export function findSqliteLibrary(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync
): SqliteLibraryLookup {
  const declared = env[SQLITE_LIBRARY_ENV]
  if (declared) {
    return exists(declared)
      ? { path: realpathSync(declared) }
      : {
          reason: `${SQLITE_LIBRARY_ENV} names ${declared}, which does not exist`,
        }
  }
  if (platform !== 'darwin') {
    return { reason: 'bun uses its own SQLite on this platform' }
  }
  const found = MACOS_CANDIDATES.find((candidate) => exists(candidate))
  return found
    ? { path: realpathSync(found) }
    : {
        reason:
          'no libsqlite3 that allows extensions was found — install one with ' +
          `\`brew install sqlite\`, or point ${SQLITE_LIBRARY_ENV} at one`,
      }
}

/** The platform and architecture a standalone artifact is built to run on. */
export interface SqliteBuildTarget {
  platform: NodeJS.Platform
  arch: string
}

export const hostSqliteBuildTarget = (): SqliteBuildTarget => ({
  platform: process.platform,
  arch: process.arch,
})

const BUN_TARGET_PLATFORMS: Record<string, NodeJS.Platform> = {
  linux: 'linux',
  darwin: 'darwin',
  windows: 'win32',
}

const BUN_TARGET_ARCHES: Record<string, string> = {
  x64: 'x64',
  arm64: 'arm64',
  aarch64: 'arm64',
}

/**
 * Read a `bun build --compile --target` value (`bun-linux-arm64`,
 * `bun-linux-x64-musl`, `bun-darwin-x64-baseline`) as the platform the binary
 * runs on. No target is the host; one that names no architecture keeps the
 * host's. Anything else is refused rather than guessed at, since a wrong guess
 * ships another platform's native libraries.
 */
export function parseBunCompileTarget(
  target: string | undefined,
  host: SqliteBuildTarget = hostSqliteBuildTarget()
): SqliteBuildTarget {
  if (!target) return host
  const [runtime, os, arch] = target.split('-')
  const platform = os === undefined ? undefined : BUN_TARGET_PLATFORMS[os]
  const mappedArch = arch === undefined ? host.arch : BUN_TARGET_ARCHES[arch]
  if (runtime !== 'bun' || !platform || !mappedArch) {
    throw new Error(
      `The compile target ${target} is not one this build can tell the ` +
        `platform of; name it the way bun does, such as bun-linux-arm64.`
    )
  }
  return { platform, arch: mappedArch }
}

export const isCrossTarget = (
  target: SqliteBuildTarget,
  host: SqliteBuildTarget = hostSqliteBuildTarget()
): boolean => target.platform !== host.platform || target.arch !== host.arch

/** Only needed where bun would otherwise open Apple's SQLite. */
export const needsSqliteLibrary = (
  platform: NodeJS.Platform = process.platform
): boolean => platform === 'darwin'

let fallbackReason: string | undefined

/**
 * Why this process is on Apple's SQLite rather than one that loads
 * extensions, when it is — for the error a missing vec0 turns into.
 */
export const sqliteLibraryFallbackReason = (): string | undefined =>
  fallbackReason

/**
 * Point bun at the libsqlite3 {@link findSqliteLibrary} finds. Call it before
 * anything opens a database; under node, and on bun off macOS, it does nothing.
 *
 * Not finding one is a warning rather than an error: a project that loads no
 * extensions runs the same on Apple's SQLite, and one that does is told why
 * when a migration first needs them.
 */
export async function useSqliteLibrary(
  warn: (message: string) => void = (message) =>
    process.stderr.write(`${message}\n`)
): Promise<void> {
  if (!process.versions.bun || !needsSqliteLibrary()) return

  const lookup = findSqliteLibrary()
  if (lookup.reason !== undefined) {
    fallback(lookup.reason, warn)
    return
  }
  // A string, so neither tsc nor node tries to resolve a bun-only module.
  const specifier: string = 'bun:sqlite'
  const { Database } = await import(specifier)
  try {
    Database.setCustomSQLite(lookup.path)
  } catch (error: any) {
    // Bun takes a library once per process, and this module can run more than
    // once in one (`bun test` evaluates it per file), so a SQLite already being
    // loaded may well be ours. Ask the loaded one rather than assume: Apple's
    // is there only if something opened a database first.
    if (loadedSqliteAllowsExtensions(Database)) return
    fallback(
      `${lookup.path} could not be loaded: ${error?.message ?? error}`,
      warn
    )
  }
}

/** Apple's build is compiled with OMIT_LOAD_EXTENSION; Homebrew's is not. */
function loadedSqliteAllowsExtensions(Database: any): boolean {
  const db = new Database(':memory:')
  try {
    const { omitted } = db
      .query(
        "select sqlite_compileoption_used('OMIT_LOAD_EXTENSION') as omitted"
      )
      .get() as { omitted: number }
    return omitted === 0
  } finally {
    db.close()
  }
}

function fallback(reason: string, warn: (message: string) => void): void {
  fallbackReason = reason
  warn(
    `  SQLite extensions are unavailable: bun on macOS uses Apple's SQLite, ` +
      `and ${reason}.`
  )
}
