import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { LocalContent } from '@pikku/core/services/local-content'
import { createLocalContentRequestHandler } from '@pikku/core/services/local-content-request-handler'
import { createEphemeralContentSigningJWT } from './content-signing-jwt.js'

const ORIGIN = 'http://localhost:4000'
const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
} as any

/**
 * The whole file loop with the signer `pikku dev` runs. Core's own tests sign
 * with an unsigned stand-in, so they cannot show that a changed URL is refused.
 */
describe('signed content URLs with the dev signer', () => {
  let dir: string
  let content: LocalContent
  let handler: ReturnType<typeof createLocalContentRequestHandler>

  const upload = async (url: string, body: string): Promise<number> => {
    const response = await handler(
      new Request(new URL(url, ORIGIN), {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body,
      })
    )
    return response!.status
  }

  const statusOf = async (url: string | URL) =>
    (await handler(new Request(new URL(url, ORIGIN))))!.status

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-signed-urls-'))
    const config = {
      localFileUploadPath: dir,
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/content',
      server: ORIGIN,
      sizeLimit: '1kb',
    }
    const jwt = createEphemeralContentSigningJWT()
    content = new LocalContent(config, logger, jwt)
    handler = createLocalContentRequestHandler({
      content: config,
      logger,
      getJWT: () => jwt,
    })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const stored = async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'shop',
      fileKey: 'order-1/photo.png',
      contentType: 'image/png',
    })
    assert.equal(await upload(uploadUrl, 'the bytes'), 200)
  }

  test('upload, then read back through a signed URL', async () => {
    await stored()
    const url = await content.getDownloadURL({
      bucket: 'shop',
      key: 'order-1/photo.png',
    })
    const response = await handler(new Request(url))
    assert.equal(response!.status, 200)
    assert.equal(await response!.text(), 'the bytes')
  })

  test('an upload over the size limit is refused', async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'shop',
      fileKey: 'order-1/big.png',
      contentType: 'image/png',
    })
    assert.equal(await upload(uploadUrl, 'x'.repeat(2048)), 413)
  })

  test('an upload URL only writes the key it was signed for', async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'shop',
      fileKey: 'order-1/photo.png',
      contentType: 'image/png',
    })
    assert.equal(
      await upload(uploadUrl.replace('photo.png', 'other.png'), 'evil'),
      403
    )
  })

  test('a changed signature, path or expiry is refused', async () => {
    await stored()
    const signed = new URL(
      await content.getDownloadURL({ bucket: 'shop', key: 'order-1/photo.png' })
    )
    assert.equal(await statusOf(signed), 200)

    const signature = signed.searchParams.get('signature')!
    const flipped = new URL(signed)
    flipped.searchParams.set(
      'signature',
      `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`
    )
    assert.equal(await statusOf(flipped), 403)

    const unsigned = new URL(signed)
    unsigned.search = ''
    assert.equal(await statusOf(unsigned), 403)

    const moved = new URL(signed)
    moved.pathname = moved.pathname.replace('photo.png', 'other.png')
    assert.equal(await statusOf(moved), 403)

    const extended = new URL(signed)
    extended.searchParams.set('expiresAt', String(Date.now() + 86_400_000))
    assert.equal(await statusOf(extended), 403)
  })

  test('an expired URL is refused', async () => {
    await stored()
    const expired = await content.signContentKey({
      bucket: 'shop',
      contentKey: 'order-1/photo.png',
      dateLessThan: new Date(Date.now() - 1000),
    })
    assert.equal(await statusOf(expired), 403)
  })

  test('public and private are separate stores', async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'shop',
      fileKey: 'public/shelf.png',
      contentType: 'image/png',
      visibility: 'public',
    })
    assert.equal(await upload(uploadUrl, 'public bytes'), 200)

    const read = (visibility?: 'public') =>
      content.getDownloadURL({
        bucket: 'shop',
        key: 'public/shelf.png',
        visibility,
      })
    assert.equal(await statusOf(await read('public')), 200)
    assert.equal(await statusOf(await read()), 404)
  })
})
