import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { splitText } from './split-text.function.js'

const call = (data: any) => (splitText as any).func({}, data)

describe('graph:splitText', () => {
  test('text shorter than chunkSize returns a single chunk', async () => {
    const out = await call({ text: 'hello world', chunkSize: 100 })
    assert.deepEqual(out, { chunks: ['hello world'] })
  })

  test('recursive strategy splits on paragraph boundaries into bounded chunks', async () => {
    const para = 'a'.repeat(40)
    const text = [para, para, para].join('\n\n')
    const out = await call({
      text,
      strategy: 'recursive',
      chunkSize: 50,
      chunkOverlap: 0,
    })
    assert.ok(
      out.chunks.length >= 3,
      'expected each 40-char paragraph in its own chunk'
    )
    for (const c of out.chunks) {
      assert.ok(c.length <= 50, `chunk exceeded chunkSize: ${c.length}`)
    }
    // reconstructable content — every paragraph survives
    assert.ok(out.chunks.every((c: string) => c.includes('a')))
  })

  test('default strategy behaves as recursive', async () => {
    const text = ['x'.repeat(30), 'y'.repeat(30)].join('\n\n')
    const withDefault = await call({ text, chunkSize: 40, chunkOverlap: 0 })
    const withRecursive = await call({
      text,
      strategy: 'recursive',
      chunkSize: 40,
      chunkOverlap: 0,
    })
    assert.deepEqual(withDefault, withRecursive)
  })

  test('overlap carries trailing content into the next chunk', async () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`).join(' ')
    const out = await call({
      text: words,
      strategy: 'recursive',
      chunkSize: 12,
      chunkOverlap: 6,
    })
    assert.ok(out.chunks.length > 1, 'expected multiple chunks')
    // consecutive chunks share at least one word due to overlap
    const first = out.chunks[0].split(' ')
    const second = out.chunks[1].split(' ')
    assert.ok(
      first.some((w: string) => second.includes(w)),
      'expected overlapping word between consecutive chunks'
    )
  })

  test('character strategy splits on the double-newline separator', async () => {
    const text = ['one', 'two', 'three'].join('\n\n')
    const out = await call({
      text,
      strategy: 'character',
      chunkSize: 3,
      chunkOverlap: 0,
    })
    assert.deepEqual(out.chunks, ['one', 'two', 'three'])
  })

  test('empty text yields no chunks', async () => {
    const out = await call({ text: '', chunkSize: 100 })
    assert.deepEqual(out, { chunks: [] })
  })
})
