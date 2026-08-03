import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setSingletonServices } from '@pikku/core'
import { resetPikkuState } from '@pikku/core/internal'
import { LocalContent } from '@pikku/core/services/local-content'
import type { JWTService, Logger } from '@pikku/core/services'
import { PikkuBunServer } from './pikku-bun-server.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

/**
 * Signs and verifies with a plain base64 round-trip. The point of these tests is
 * that the server checks the SAME claims the signer wrote, not that any
 * particular algorithm is used — a real JWT here would only slow them down.
 */
const fakeJWT = {
  encode: async (_expiry: string, payload: unknown) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  decode: async (token: string) =>
    JSON.parse(Buffer.from(token, 'base64url').toString()),
} as unknown as JWTService

describe('PikkuBunServer local content', () => {
  let server: PikkuBunServer
  let content: LocalContent
  let tmpDir: string
  let origin: string

  before(async () => {
    resetPikkuState()
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    tmpDir = mkdtempSync(join(tmpdir(), 'pikku-bun-content-'))
    mkdirSync(join(tmpDir, 'bucket'), { recursive: true })
    writeFileSync(join(tmpDir, 'bucket', 'existing.bin'), 'already here')

    const contentConfig = {
      localFileUploadPath: tmpDir,
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/assets',
      sizeLimit: '1mb',
    }
    // The service under test on the client side: the URLs it hands out are
    // exactly what the server must answer, so they are not hand-written here.
    content = new LocalContent(contentConfig, noopLogger, fakeJWT)

    server = new PikkuBunServer(
      {
        port: 0,
        hostname: '127.0.0.1',
        content: contentConfig,
      } as any,
      noopLogger,
      { contentSigningJWT: fakeJWT }
    )
    await server.init()
    await server.start()
    origin = `http://127.0.0.1:${server.port}`
  })

  after(async () => {
    await server.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('answers the upload URL the content service hands out', async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'bucket',
      fileKey: 'nested/file.bin',
      contentType: 'application/octet-stream',
    } as any)

    const response = await fetch(`${origin}${uploadUrl}`, {
      method: 'PUT',
      body: 'uploaded bytes',
    })

    assert.equal(response.status, 200)
    assert.equal(
      readFileSync(join(tmpDir, 'bucket', 'nested', 'file.bin'), 'utf8'),
      'uploaded bytes'
    )
  })

  test('serves an asset through the signed URL the content service produces', async () => {
    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'existing.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    } as any)

    const response = await fetch(`${origin}${signed}`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'already here')
  })

  test('refuses an unsigned asset read', async () => {
    const response = await fetch(`${origin}/assets/bucket/existing.bin`)
    assert.equal(response.status, 403)
  })

  test('refuses a signature minted for a different asset', async () => {
    // The signature is valid and unexpired — only the path differs. Without the
    // path claim being checked, one signed URL would read the whole bucket.
    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'existing.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    } as any)
    writeFileSync(join(tmpDir, 'bucket', 'other.bin'), 'other')

    const query = signed.slice(signed.indexOf('?'))
    const response = await fetch(`${origin}/assets/bucket/other.bin${query}`)
    assert.equal(response.status, 403)
  })

  test('refuses an expired signature', async () => {
    const signed = await content.signContentKey({
      bucket: 'bucket',
      contentKey: 'existing.bin',
      dateLessThan: new Date(Date.now() - 1_000),
    } as any)

    const response = await fetch(`${origin}${signed}`)
    assert.equal(response.status, 403)
  })

  // `fetch` normalises `..` out of the path before the request leaves the
  // client, so this cannot drive the guard itself — that is covered directly in
  // core's local-content-request-handler.test.ts. What it does prove is that
  // nothing in the server path un-normalises it back into a write.
  test('does not write outside the content directory', async () => {
    writeFileSync(join(tmpDir, '..', 'pikku-bun-content-secret.txt'), 'secret')
    try {
      const response = await fetch(
        `${origin}/upload/%2e%2e/pikku-bun-content-secret.txt`,
        { method: 'PUT', body: 'overwritten' }
      )
      assert.notEqual(response.status, 200)
      assert.equal(
        readFileSync(
          join(tmpDir, '..', 'pikku-bun-content-secret.txt'),
          'utf8'
        ),
        'secret'
      )
    } finally {
      rmSync(join(tmpDir, '..', 'pikku-bun-content-secret.txt'), {
        force: true,
      })
    }
  })

  test('rejects an upload over the size limit', async () => {
    const { uploadUrl } = await content.getUploadURL({
      bucket: 'bucket',
      fileKey: 'too-big.bin',
      contentType: 'application/octet-stream',
    } as any)

    const response = await fetch(`${origin}${uploadUrl}`, {
      method: 'PUT',
      body: Buffer.alloc(1024 * 1024 + 1),
    })
    assert.equal(response.status, 413)
  })

  test('leaves non-content paths to the router', async () => {
    const response = await fetch(`${origin}/uploadsomething`)
    assert.equal(response.status, 404)
  })
})
