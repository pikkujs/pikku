import { crc32, deflateSync } from 'node:zlib'

/**
 * A valid, deliberately plain app icon.
 *
 * Tauri's bundler refuses to package without one, so a generated shell has to
 * ship something rather than leaving the first `tauri build` to fail on a
 * missing file. Encoding it here keeps the generator free of binary fixtures
 * and of an image dependency; `npx tauri icon <your-icon.png>` replaces it with
 * the full platform set the moment a project has real artwork.
 */

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const chunk = (type: string, data: Buffer): Buffer => {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData) >>> 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** A flat slate square — recognisably a placeholder, and legible at any size. */
const FILL = [0x2f, 0x36, 0x40, 0xff] as const

export const renderPlaceholderIcon = (size: number): Buffer => {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`Icon size must be a positive integer, got ${size}`)
  }

  const stride = 1 + size * 4
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride
    // Filter type 0 (None) — no prediction, so the row is its own pixels.
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4
      raw[px] = FILL[0]
      raw[px + 1] = FILL[1]
      raw[px + 2] = FILL[2]
      raw[px + 3] = FILL[3]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(6, 9)
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12)

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
