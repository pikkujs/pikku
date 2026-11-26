/**
 * The generated check itself, written out and run against a content service that
 * only streams, with no engine and no app.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { crudTempDir } from '../../../../test-fixtures/crud/temp-dir.js'
import { FFMPEG_AVIF, IMAGES } from '../../../../test-fixtures/crud/images.js'
import { imageExtensions } from './crud-columns.js'
import { serializeCrudRuntime } from './serialize-crud-runtime.js'

type Type = keyof typeof IMAGES
const TYPES = Object.keys(IMAGES) as Type[]
const EXTENSIONS: Record<string, string> = imageExtensions(TYPES)

let dir: string
let crudUploaded: (...args: any[]) => Promise<void>

before(async () => {
  dir = await crudTempDir('image-check-')
  const file = join(dir, 'crud-runtime.gen.ts')
  await writeFile(
    file,
    serializeCrudRuntime({ errorLeaf: '@pikku/core/errors' })
  )
  ;({ crudUploaded } = await import(pathToFileURL(file).href))
})
after(async () => {
  await rm(dir, { recursive: true, force: true })
})

const chunked = (bytes: Uint8Array, size: number) => {
  const chunks: Uint8Array[] = []
  for (let at = 0; at < bytes.length; at += size) {
    chunks.push(bytes.subarray(at, at + size))
  }
  return chunks
}

const STREAMS: [string, (bytes: Uint8Array) => unknown][] = [
  ['one chunk', (bytes) => Readable.from([bytes])],
  ['a byte at a time', (bytes) => Readable.from(chunked(bytes, 1))],
  [
    'a web stream',
    (bytes) =>
      new ReadableStream({
        start(controller) {
          for (const chunk of chunked(bytes, 7)) controller.enqueue(chunk)
          controller.close()
        },
      }),
  ],
]

const check = (
  stream: unknown,
  type: Type,
  { maxBytes = 100_000, accept = TYPES } = {}
) => {
  const key = `crud/a/b/file.${EXTENSIONS[type]}`
  return crudUploaded(
    {
      listFilesByPrefix: async () => [key],
      readFile: async () => stream,
    },
    'site',
    key,
    { maxBytes, extensions: imageExtensions(accept) }
  )
}

const REAL: [string, Type, Buffer][] = [
  ...TYPES.map((type): [string, Type, Buffer] => [type, type, IMAGES[type]]),
  ['image/avif from ffmpeg', 'image/avif', FFMPEG_AVIF],
]

describe('the generated image check', () => {
  for (const [name, stream] of STREAMS) {
    test(`takes each real image, in ${name}`, async () => {
      for (const [what, type, bytes] of REAL) {
        await assert.doesNotReject(check(stream(bytes), type), what)
      }
    })

    test(`refuses each one cut short, in ${name}`, async () => {
      for (const [what, type, bytes] of REAL) {
        for (const length of [
          0,
          4,
          Math.floor(bytes.length / 2),
          bytes.length - 1,
        ]) {
          await assert.rejects(
            check(stream(bytes.subarray(0, length)), type),
            /not a complete image/,
            `${what} at ${length}`
          )
        }
      }
    })
  }

  test('refuses each real image under another type', async () => {
    for (const [what, actual, bytes] of REAL) {
      for (const claimed of TYPES.filter((type) => type !== actual)) {
        await assert.rejects(
          check(Readable.from([bytes]), claimed),
          /not a complete image/,
          `${what} as ${claimed}`
        )
      }
    }
  })

  test('refuses what only begins or only ends like an image', async () => {
    const png = IMAGES['image/png']
    const html = Buffer.from('<script>alert(1)</script>')
    for (const [what, bytes] of [
      ['text', html],
      ['a PNG signature, then text', Buffer.concat([png.subarray(0, 8), html])],
      ['text, then the end of a PNG', Buffer.concat([html, png.subarray(-12)])],
      [
        'AVIF boxes of another brand',
        Buffer.from(
          IMAGES['image/avif']
            .toString('latin1')
            .replaceAll('avif', 'heic')
            .replaceAll('avis', 'heis'),
          'latin1'
        ),
      ],
    ] as const) {
      const type = what.startsWith('AVIF') ? 'image/avif' : 'image/png'
      await assert.rejects(
        check(Readable.from([bytes]), type),
        /not a complete image/,
        what
      )
    }
  })

  test('takes a file of exactly the limit, and not one byte more', async () => {
    const png = IMAGES['image/png']
    await check(Readable.from([png]), 'image/png', { maxBytes: png.length })
    await assert.rejects(
      check(Readable.from([png]), 'image/png', { maxBytes: png.length - 1 }),
      /larger than this field takes/
    )
  })

  test('stops reading an endless file just past the limit and closes it', async () => {
    let read = 0
    let closed = false
    const endless = (async function* () {
      try {
        for (;;) {
          read += 1000
          yield new Uint8Array(1000)
        }
      } finally {
        closed = true
      }
    })()
    await assert.rejects(
      check(endless, 'image/png', { maxBytes: 5000 }),
      /larger than this field takes/
    )
    assert.deepEqual([read, closed], [6000, true])
  })

  test('refuses a type the field does not take, or that it cannot recognise', async () => {
    await assert.rejects(
      check(Readable.from([IMAGES['image/gif']]), 'image/gif', {
        accept: ['image/png'],
      }),
      /cannot be verified/
    )
    await assert.rejects(
      crudUploaded(
        {
          listFilesByPrefix: async () => ['k.svg'],
          readFile: async () => assert.fail('nothing to read'),
        },
        'site',
        'k.svg',
        { maxBytes: 10, extensions: { 'image/svg+xml': 'svg' } }
      ),
      /cannot be verified/
    )
  })
})
