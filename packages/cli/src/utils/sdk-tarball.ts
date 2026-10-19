import { gzipSync } from 'node:zlib'

/**
 * A minimal ustar writer for addon SDK artifacts. An SDK is a handful
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
