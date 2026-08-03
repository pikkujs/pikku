import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JWTService, Logger } from './index.js'
import { LocalContent } from './local-content.js'
import { createLocalContentRequestHandler } from './local-content-request-handler.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

const fakeJWT = {
  encode: async (_expiry: string, payload: unknown) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  decode: async (token: string) =>
    JSON.parse(Buffer.from(token, 'base64url').toString()),
} as unknown as JWTService

describe('createLocalContentRequestHandler', () => {
  let tmpDir: string
  let handler: ReturnType<typeof createLocalContentRequestHandler>
  let content: LocalContent

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pikku-content-handler-'))
    mkdirSync(join(tmpDir, 'bucket'), { recursive: true })
    writeFileSync(join(tmpDir, 'bucket', 'existing.bin'), 'already here')

    const config = {
      localFileUploadPath: tmpDir,
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/assets',
      sizeLimit: '1mb',
    }
    content = new LocalContent(config, noopLogger, fakeJWT)
    handler = createLocalContentRequestHandler({
      content: config,
      logger: noopLogger,
      getJWT: () => fakeJWT,
    })
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns null for a path outside both prefixes', async () => {
    const result = await handler(
      new Request('http://localhost/uploadsomething')
    )
    assert.equal(result, null)
  })

  test('returns null for a method neither prefix handles', async () => {
    const result = await handler(
      new Request('http://localhost/upload/bucket/x.bin', { method: 'GET' })
    )
    assert.equal(result, null)
  })

  // Encoded SEPARATORS, not encoded dots. `%2e%2e` never reaches the handler:
  // the URL parser treats it as a double-dot segment and resolves it away, so
  // the path arrives already outside the prefix. `%2f` survives parsing intact
  // and only becomes a separator when the handler decodes it — which is the one
  // way a `..` can still be sitting in the key by the time it is resolved, and
  // therefore the case the guard actually has to catch.
  test('refuses an upload whose key escapes the content directory', async () => {
    writeFileSync(join(tmpDir, '..', 'pikku-handler-secret.txt'), 'secret')
    try {
      const response = await handler(
        new Request(
          'http://localhost/upload/bucket/..%2f..%2fpikku-handler-secret.txt',
          { method: 'PUT', body: 'overwritten' }
        )
      )
      assert.equal(response?.status, 400)
      assert.equal(
        readFileSync(join(tmpDir, '..', 'pikku-handler-secret.txt'), 'utf8'),
        'secret'
      )
    } finally {
      rmSync(join(tmpDir, '..', 'pikku-handler-secret.txt'), { force: true })
    }
  })

  test('refuses an asset read whose key escapes the content directory', async () => {
    const response = await handler(
      new Request('http://localhost/assets/bucket/..%2f..%2fanything.txt')
    )
    assert.equal(response?.status, 400)
  })

  test('round-trips an upload and a signed read', async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'bucket',
      fileKey: 'round/trip.bin',
      contentType: 'application/octet-stream',
    } as any)
    const put = await handler(
      new Request(`http://localhost${uploadUrl}`, {
        method: 'PUT',
        body: 'payload',
      })
    )
    assert.equal(put?.status, 200)

    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'round/trip.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    } as any)
    const get = await handler(new Request(`http://localhost${signed}`))
    assert.equal(get?.status, 200)
    assert.equal(await get!.text(), 'payload')
  })

  test('HEAD returns the length without the body', async () => {
    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'existing.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    } as any)
    const response = await handler(
      new Request(`http://localhost${signed}`, { method: 'HEAD' })
    )
    assert.equal(response?.status, 200)
    assert.equal(
      response?.headers.get('content-length'),
      String('already here'.length)
    )
    assert.equal(await response!.text(), '')
  })

  test('refuses a read with no signature at all', async () => {
    const response = await handler(
      new Request('http://localhost/assets/bucket/existing.bin')
    )
    assert.equal(response?.status, 403)
  })

  test('refuses a signature that verifies but names another path', async () => {
    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'existing.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    } as any)
    writeFileSync(join(tmpDir, 'bucket', 'sibling.bin'), 'sibling')
    const query = signed.slice(signed.indexOf('?'))
    const response = await handler(
      new Request(`http://localhost/assets/bucket/sibling.bin${query}`)
    )
    assert.equal(response?.status, 403)
  })

  test('refuses signed reads when no JWT service is available', async () => {
    const unverifiable = createLocalContentRequestHandler({
      content: {
        localFileUploadPath: tmpDir,
        uploadUrlPrefix: '/upload',
        assetUrlPrefix: '/assets',
      },
      logger: noopLogger,
      getJWT: () => undefined,
    })
    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'existing.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    } as any)
    const response = await unverifiable(
      new Request(`http://localhost${signed}`)
    )
    assert.equal(response?.status, 403)
  })

  test('rejects a body over the size limit without writing it', async () => {
    const response = await handler(
      new Request('http://localhost/upload/bucket/big.bin', {
        method: 'PUT',
        body: Buffer.alloc(1024 * 1024 + 1),
      })
    )
    assert.equal(response?.status, 413)
    // Abandoning the stream must leave nothing behind — a partial file here
    // would be a truncated asset that later reads would serve as if whole.
    assert.equal(existsSync(join(tmpDir, 'bucket', 'big.bin')), false)
  })
})
