import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { PGlite } from '@electric-sql/pglite'

/**
 * Booting an empty PGlite runs `initdb`, which takes seconds. Loading a copy of
 * a data directory it already produced is several times quicker and gives an
 * instance just as separate, so the first boot is dumped and every later one,
 * in this process or another, starts from that dump.
 *
 * The copy on disk lives in the user's own cache directory, never in the
 * project, so that a checked-out repository cannot supply a database.
 */
// A relative XDG_CACHE_HOME is ignored, as the XDG spec asks: it would resolve
// against the working directory, which can be the project.
export const userCacheDir = (): string => {
  const configured = process.env.XDG_CACHE_HOME
  return configured && isAbsolute(configured)
    ? configured
    : join(homedir(), '.cache')
}

const snapshotFile = (): string => {
  const entry = createRequire(import.meta.url).resolve('@electric-sql/pglite')
  const { version } = JSON.parse(
    readFileSync(join(dirname(entry), '..', 'package.json'), 'utf8')
  )
  return join(userCacheDir(), 'pikku', `pglite-${version}.tar.gz`)
}

const asTar = (bytes: Uint8Array): Blob =>
  new Blob([new Uint8Array(bytes)], { type: 'application/x-tar' })

const readSnapshot = (): Blob | undefined => {
  try {
    return asTar(gunzipSync(readFileSync(snapshotFile())))
  } catch {
    return undefined
  }
}

// The cache only saves time, so failing to write it must not fail the command.
const writeSnapshot = async (snapshot: Blob): Promise<void> => {
  try {
    const file = snapshotFile()
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    const partial = `${file}.${process.pid}`
    const bytes = Buffer.from(await snapshot.arrayBuffer())
    writeFileSync(partial, gzipSync(bytes), { mode: 0o600 })
    renameSync(partial, file)
  } catch {}
}

/**
 * Opens empty databases: from the snapshot when there is one that loads,
 * otherwise from a new one. `open` starts a database from the data it is handed.
 * `bootBare` starts one with no project extensions, which is the only kind a
 * snapshot is taken from: an extension may write to the database as it boots,
 * and the snapshot is shared by every project.
 */
export function createPristineOpener() {
  // Held uncompressed, so that only the copy on disk costs a decompression.
  let inMemory: Blob | undefined

  return async (
    open: (loadDataDir: Blob) => Promise<PGlite>,
    bootBare: () => Promise<PGlite>
  ): Promise<PGlite> => {
    const snapshot = inMemory ?? readSnapshot()
    if (snapshot) {
      try {
        const db = await open(snapshot)
        inMemory = snapshot
        return db
      } catch {
        // A damaged or unreadable snapshot is replaced below.
        inMemory = undefined
      }
    }

    const bare = await bootBare()
    let taken: Blob
    try {
      await bare.exec('CHECKPOINT')
      taken = await bare.dumpDataDir('none')
    } finally {
      await bare.close()
    }
    await writeSnapshot(taken)
    inMemory = taken
    return open(taken)
  }
}

export const openPristineDatabase = createPristineOpener()
