import { existsSync, readFileSync } from 'node:fs'
import type { KeyRecord } from '@pikku/core/keypair'
import { MemoryKeyStore } from '../memory-key-store.js'
import { writeFileAtomic } from './atomic-write.js'

/**
 * The ledger as a JSON file (the dev and CLI store, replacing `signing.key`).
 * It holds public halves and custody locations only, never a private half, and
 * is rewritten atomically after every change (temp file, fsync, rename). One
 * process owns a file: it is not a multi-instance store.
 */
export class FileKeyStore extends MemoryKeyStore {
  constructor(private readonly path: string) {
    super()
    if (existsSync(path)) {
      const rows = JSON.parse(readFileSync(path, 'utf8')) as KeyRecord[]
      for (const row of rows) this.records.set(row.kid, row)
    }
  }

  protected override async persist() {
    writeFileAtomic(
      this.path,
      JSON.stringify([...this.records.values()], null, 2)
    )
  }
}
