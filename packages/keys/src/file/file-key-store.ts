import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
import type { KeyRecord } from '@pikku/core/keypair'
import { MemoryKeyStore } from '../memory-key-store.js'

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
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const tmp = `${this.path}.${process.pid}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, JSON.stringify([...this.records.values()], null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    chmodSync(tmp, 0o600)
    renameSync(tmp, this.path)
  }
}
