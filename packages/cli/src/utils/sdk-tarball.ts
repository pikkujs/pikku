import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * A minimal ustar writer and reader for addon SDK artifacts. An SDK is a handful
 * of small text files, so the archive is built in memory: no dependency, and the
 * same inputs always produce the same bytes (fixed mtime, mode and owner).
 */

const BLOCK = 512

export interface TarEntry {
  path: string
  content: Buffer
}

const writeString = (
  header: Buffer,
  offset: number,
  length: number,
  value: string
) => {
  header.write(value.slice(0, length), offset, length, 'utf-8')
}

const writeOctal = (
  header: Buffer,
  offset: number,
  length: number,
  value: number
) => {
  writeString(
    header,
    offset,
    length,
    value.toString(8).padStart(length - 1, '0') + '\0'
  )
}

const tarHeader = (path: string, size: number): Buffer => {
  if (Buffer.byteLength(path) > 100) {
    throw new Error(`SDK path too long for a tar header: ${path}`)
  }
  const header = Buffer.alloc(BLOCK)
  writeString(header, 0, 100, path)
  writeOctal(header, 100, 8, 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, 0)
  header.fill(' ', 148, 156)
  header.write('0', 156)
  writeString(header, 257, 6, 'ustar\0')
  writeString(header, 263, 2, '00')
  let checksum = 0
  for (const byte of header) checksum += byte
  writeString(header, 148, 8, checksum.toString(8).padStart(6, '0') + '\0 ')
  return header
}

export const packTarGz = (entries: TarEntry[]): Buffer => {
  const chunks: Buffer[] = []
  for (const { path, content } of [...entries].sort((a, b) =>
    a.path.localeCompare(b.path)
  )) {
    chunks.push(tarHeader(path, content.length), content)
    const padding = (BLOCK - (content.length % BLOCK)) % BLOCK
    if (padding) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(BLOCK * 2))
  return gzipSync(Buffer.concat(chunks), { level: 9 })
}

const readString = (buf: Buffer, offset: number, length: number) => {
  const raw = buf.subarray(offset, offset + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf-8')
}

/** Regular files only, keyed by path with any leading `./` or `package/` dropped. */
export const unpackTarGz = (archive: Buffer): Map<string, Buffer> => {
  const tar = gunzipSync(archive)
  const files = new Map<string, Buffer>()
  let offset = 0
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break
    const name = readString(header, 0, 100)
    const prefix = readString(header, 345, 155)
    const sizeText = readString(header, 124, 12).trim() || '0'
    const size = /^[0-7]+$/.test(sizeText) ? parseInt(sizeText, 8) : NaN
    const type = String.fromCharCode(header[156] || 48)
    const start = offset + BLOCK
    if (!Number.isSafeInteger(size) || size > tar.length - start) {
      throw new Error(
        `Not a valid SDK archive: the entry at byte ${offset} has size '${sizeText}'.`
      )
    }
    if (type === '0' || type === '\0') {
      const path = (prefix ? `${prefix}/${name}` : name).replace(
        /^(\.\/|package\/)/,
        ''
      )
      files.set(path, Buffer.from(tar.subarray(start, start + size)))
    }
    offset = start + Math.ceil(size / BLOCK) * BLOCK
  }
  return files
}
