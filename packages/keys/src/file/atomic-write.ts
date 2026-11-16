import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'

/**
 * Writes `data` to `path` so a reader sees the old file or the new one, never
 * a partial one: temp file in the same directory (mode 0600), fsync, rename,
 * then fsync of the directory so the rename itself survives a crash. The
 * directory is created 0700.
 */
export const writeFileAtomic = (path: string, data: string): void => {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  chmodSync(tmp, 0o600)
  renameSync(tmp, path)
  const dirFd = openSync(dir, 'r')
  try {
    fsyncSync(dirFd)
  } finally {
    closeSync(dirFd)
  }
}
