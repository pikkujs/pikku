import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { LockRecord, LockVault } from '@pikku/core/classification'

/**
 * Lock records on disk, next to the rest of the server's runtime state.
 *
 * A vault has to be readable while the store is locked — a store that needed
 * its own key to find out how to unlock itself could never be opened — which
 * costs nothing here, because a record holds a salt and a sealed verifier and
 * no plaintext key material at all.
 */
export class FileLockVault implements LockVault {
  private readonly file: string

  constructor(file: string) {
    this.file = resolve(file)
  }

  async read(): Promise<LockRecord[]> {
    try {
      return JSON.parse(await readFile(this.file, 'utf-8')) as LockRecord[]
    } catch {
      // No file yet is the first-run case: an uninitialized store, which is
      // exactly what an empty record list means.
      return []
    }
  }

  async write(records: LockRecord[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify(records, null, 2), 'utf-8')
  }
}
