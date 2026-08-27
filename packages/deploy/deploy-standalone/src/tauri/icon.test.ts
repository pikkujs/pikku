import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'

import { renderPlaceholderIcon } from './icon.js'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const chunks = (png: Buffer) => {
  const found: Array<{ type: string; data: Buffer }> = []
  let offset = PNG_SIGNATURE.length
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const data = png.subarray(offset + 8, offset + 8 + length)
    const crc = png.readUInt32BE(offset + 8 + length)
    found.push({ type, data })
    assert.equal(typeof crc, 'number')
    offset += 12 + length
  }
  return found
}

describe('the placeholder icon a generated shell ships with', () => {
  it('is a real PNG, not a stub a bundler will reject', () => {
    const png = renderPlaceholderIcon(512)
    assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE))

    const parsed = chunks(png)
    assert.deepEqual(
      parsed.map((c) => c.type),
      ['IHDR', 'IDAT', 'IEND'],
      'a decoder walks the chunks in order and stops at IEND'
    )
  })

  it('is square at the size asked for, in 8-bit RGBA', () => {
    const ihdr = chunks(renderPlaceholderIcon(256)).find(
      (c) => c.type === 'IHDR'
    )!
    assert.equal(ihdr.data.readUInt32BE(0), 256)
    assert.equal(ihdr.data.readUInt32BE(4), 256)
    assert.equal(ihdr.data.readUInt8(8), 8, 'bit depth')
    assert.equal(ihdr.data.readUInt8(9), 6, 'colour type RGBA')
  })

  it('carries one filter byte and one opaque row per line', () => {
    const size = 8
    const idat = chunks(renderPlaceholderIcon(size)).find(
      (c) => c.type === 'IDAT'
    )!
    const raw = inflateSync(idat.data)
    assert.equal(raw.length, size * (1 + size * 4))
    for (let y = 0; y < size; y++) {
      assert.equal(raw[y * (1 + size * 4)], 0, 'filter type 0')
    }
    assert.equal(raw[4], 255, 'alpha must be opaque')
  })

  it('is deterministic, so regenerating never churns the file', () => {
    assert.ok(renderPlaceholderIcon(64).equals(renderPlaceholderIcon(64)))
  })
})
