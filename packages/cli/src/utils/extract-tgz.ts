import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'

export type TarEntry = { path: string; data: Buffer }

const BLOCK = 512

const field = (header: Buffer, offset: number, length: number): string => {
  const raw = header.subarray(offset, offset + length)
  const nul = raw.indexOf(0)
  return raw.subarray(0, nul === -1 ? length : nul).toString('utf-8')
}

const octal = (header: Buffer, offset: number, length: number): number => {
  const text = field(header, offset, length).trim()
  return text ? parseInt(text, 8) : 0
}

/** The `path=` record of a pax extended header, if it has one. */
const paxPath = (data: Buffer): string | undefined => {
  let rest = data.toString('utf-8')
  while (rest.length) {
    const space = rest.indexOf(' ')
    const length = parseInt(rest.slice(0, space), 10)
    if (!(length > 0)) return undefined
    const record = rest.slice(space + 1, length - 1)
    rest = rest.slice(length)
    if (record.startsWith('path=')) return record.slice('path='.length)
  }
  return undefined
}

/**
 * The regular files in a gzipped tarball. Directory entries are skipped;
 * links, devices and any path that is absolute or climbs out with `..` are
 * refused, so extracting the result cannot write outside its target.
 */
export const readTgz = (tgz: Buffer): TarEntry[] => {
  const tar = gunzipSync(tgz)
  const entries: TarEntry[] = []
  let offset = 0
  let nextPath: string | undefined
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((b) => b === 0)) break
    const size = octal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 48)
    const dataStart = offset + BLOCK
    const data = tar.subarray(dataStart, dataStart + size)
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK

    if (type === 'x') {
      nextPath = paxPath(data) ?? nextPath
      continue
    }
    if (type === 'L') {
      nextPath = field(data, 0, data.length)
      continue
    }
    if (type === 'g') continue

    const prefix = field(header, 345, 155)
    const name = field(header, 0, 100)
    const path = nextPath ?? (prefix ? `${prefix}/${name}` : name)
    nextPath = undefined

    if (type === '5') continue
    if (type !== '0' && type !== '7') {
      throw new Error(
        `the SDK tarball holds '${path}', which is not a regular file (tar type '${type}')`
      )
    }
    const normalized = posix.normalize(path.replace(/\\/g, '/'))
    if (
      posix.isAbsolute(normalized) ||
      normalized === '..' ||
      normalized.startsWith('../')
    ) {
      throw new Error(`the SDK tarball holds '${path}', which escapes it`)
    }
    entries.push({
      path: normalized.replace(/^\.\//, ''),
      data: Buffer.from(data),
    })
  }
  return entries
}

/**
 * Writes the entries under `targetDir`. When the tarball has no top-level
 * `manifest.json` but every file sits under one directory (npm pack's
 * `package/`), that directory is stripped.
 */
export const writeSdkEntries = async (
  entries: TarEntry[],
  targetDir: string
): Promise<void> => {
  let strip = ''
  if (!entries.some((e) => e.path === 'manifest.json')) {
    const tops = new Set(entries.map((e) => e.path.split('/')[0]))
    const [top] = tops
    if (tops.size === 1 && top && entries.every((e) => e.path.includes('/'))) {
      strip = `${top}/`
    }
  }
  for (const entry of entries) {
    const relative = entry.path.slice(strip.length)
    if (!relative) continue
    const target = join(targetDir, ...relative.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, entry.data)
  }
}
