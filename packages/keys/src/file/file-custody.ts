import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { KeyFileCustody } from '../custody.js'

/**
 * Custody `file`: the private half as `<keysDir>/<name>/<kid>.key`, mode 0600,
 * its directory 0700, protected by the OS user and nothing else. A file that
 * is missing or readable by anyone but the owner counts as lost.
 */
export class FileCustody implements KeyFileCustody {
  constructor(private readonly keysDir: string) {}

  refFor(name: string, _scopeKey: string, kid: string): string {
    // A kid is base64url or a UUID: safe as a file name. Anything else is refused.
    if (!/^[A-Za-z0-9_-]+$/.test(kid) || !/^[a-z0-9-]+$/.test(name)) {
      throw new Error('Refusing an unsafe key file name.')
    }
    return join(this.keysDir, name, `${kid}.key`)
  }

  async write(ref: string, privateKey: string) {
    mkdirSync(dirname(ref), { recursive: true, mode: 0o700 })
    chmodSync(dirname(ref), 0o700)
    const tmp = `${ref}.${process.pid}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, privateKey)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    chmodSync(tmp, 0o600)
    renameSync(tmp, ref)
  }

  async read(ref: string) {
    return readFileSync(ref, 'utf8')
  }

  async has(ref: string) {
    if (!existsSync(ref)) return false
    return (statSync(ref).mode & 0o077) === 0
  }

  async remove(ref: string) {
    rmSync(ref, { force: true })
  }
}
