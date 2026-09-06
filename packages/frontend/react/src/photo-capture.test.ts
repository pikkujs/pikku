/**
 * Run: node --test packages/frontend/react/src/photo-capture.test.ts
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, prepareImage } from './photo-capture.ts'

test('fitWithin scales the longest edge down', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1024), { width: 1024, height: 768 })
  assert.deepEqual(fitWithin(3024, 4032, 1024), { width: 768, height: 1024 })
})

test('fitWithin never scales up', () => {
  assert.deepEqual(fitWithin(400, 300, 1024), { width: 400, height: 300 })
})

test('fitWithin keeps a hairline image at least one pixel', () => {
  assert.deepEqual(fitWithin(4000, 1, 1024), { width: 1024, height: 1 })
})

test('fitWithin rejects an image with no dimensions', () => {
  assert.throws(() => fitWithin(0, 0, 1024), /no readable dimensions/)
})

/**
 * `prepareImage` is DOM-bound, so the DOM is faked the same way the locale store
 * test fakes `window`. What is being checked is the wiring — that the canvas is
 * sized from `fitWithin`, that the encode is asked for the requested type, and
 * that the `data:` prefix is stripped off `data` but kept on `dataUrl`.
 */
const drawn: Array<{ width: number; height: number; type: string; quality: number }> = []
let closed = false

const installDom = (bitmap: { width: number; height: number }) => {
  ;(globalThis as any).createImageBitmap = async () => ({
    ...bitmap,
    close: () => {
      closed = true
    },
  })
  ;(globalThis as any).document = {
    createElement: () => {
      const canvas: any = { width: 0, height: 0 }
      canvas.getContext = () => ({ drawImage: () => {} })
      canvas.toDataURL = (type: string, quality: number) => {
        drawn.push({ width: canvas.width, height: canvas.height, type, quality })
        return `data:${type};base64,QUJD`
      }
      return canvas
    },
  }
}

afterEach(() => {
  drawn.length = 0
  closed = false
  delete (globalThis as any).createImageBitmap
  delete (globalThis as any).document
})

test('prepareImage downscales, encodes and strips the data prefix', async () => {
  installDom({ width: 4032, height: 3024 })
  const photo = await prepareImage({ name: 'fridge.jpg' } as unknown as File)

  assert.deepEqual(drawn, [{ width: 1024, height: 768, type: 'image/jpeg', quality: 0.8 }])
  assert.equal(photo.data, 'QUJD')
  assert.equal(photo.dataUrl, 'data:image/jpeg;base64,QUJD')
  assert.equal(photo.mediaType, 'image/jpeg')
  assert.equal(photo.width, 1024)
  assert.equal(photo.height, 768)
  assert.equal(photo.bytes, 3)
  assert.equal(closed, true, 'the decoded bitmap is released')
})

test('prepareImage honours maxEdge, quality and mediaType', async () => {
  installDom({ width: 2000, height: 1000 })
  const photo = await prepareImage({} as File, {
    maxEdge: 500,
    quality: 0.5,
    mediaType: 'image/webp',
  })

  assert.deepEqual(drawn, [{ width: 500, height: 250, type: 'image/webp', quality: 0.5 }])
  assert.equal(photo.mediaType, 'image/webp')
})
