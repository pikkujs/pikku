import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
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

const CHUNK = Buffer.alloc(1024 * 1024, 7)

const generated = (megabytes: number) =>
  Readable.from(
    (async function* () {
      for (let i = 0; i < megabytes; i++) yield CHUNK
    })()
  )

const allFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? allFiles(join(dir, entry.name))
      : [join(dir, entry.name)]
  )

describe('local content over real HTTP', () => {
  let dir: string
  let server: Server
  let content: LocalContent
  let origin: string

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pikku-content-e2e-'))
    server = createServer(async (req, res) => {
      const url = `http://${req.headers.host}${req.url}`
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
      const request = new Request(url, {
        method: req.method,
        body: hasBody ? (Readable.toWeb(req) as never) : undefined,
        duplex: 'half',
      } as RequestInit)
      const response = await handler(request)
      if (!response) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries())
      )
      if (response.body) {
        Readable.fromWeb(response.body as never).pipe(res)
      } else {
        res.end()
      }
    })
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve())
    )
    const port = (server.address() as { port: number }).port
    origin = `http://127.0.0.1:${port}`
    const config = {
      localFileUploadPath: dir,
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/content',
      server: origin,
      sizeLimit: '1gb',
    }
    content = new LocalContent(config, noopLogger, fakeJWT)
    handler = createLocalContentRequestHandler({
      content: config,
      logger: noopLogger,
      getJWT: () => fakeJWT,
    })
  })

  let handler: ReturnType<typeof createLocalContentRequestHandler>

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  })

  const upload = async (
    args: { bucket: string; fileKey: string; visibility?: 'public' | 'private' },
    body: BodyInit | Readable,
    size?: number
  ) => {
    const target = await content.getUploadURL({
      ...args,
      contentType: 'application/octet-stream',
      size,
    })
    return fetch(new URL(target.uploadUrl, origin), {
      method: 'PUT',
      body: body instanceof Readable ? (Readable.toWeb(body) as never) : body,
      duplex: 'half',
      headers: target.uploadHeaders,
    } as RequestInit)
  }

  test('a private file round-trips through a signed upload and a signed read', async () => {
    const bytes = Buffer.from('private bytes')
    const put = await upload({ bucket: 'lib', fileKey: 'a/private.txt' }, bytes)
    assert.equal(put.status, 200)

    const url = await content.signContentKey({
      bucket: 'lib',
      contentKey: 'a/private.txt',
      dateLessThan: new Date(Date.now() + 60_000),
    })
    const got = await fetch(url)
    assert.equal(got.status, 200)
    assert.deepEqual(Buffer.from(await got.arrayBuffer()), bytes)
  })

  test('a private file cannot be read without a signature', async () => {
    await upload({ bucket: 'lib', fileKey: 'a/closed.txt' }, Buffer.from('x'))
    const bare = await fetch(`${origin}/content/lib/a/closed.txt`)
    assert.equal(bare.status, 403)
  })

  test('a public file is readable with no signature at its public URL', async () => {
    const put = await upload(
      { bucket: 'site', fileKey: 'logo.png', visibility: 'public' },
      Buffer.from('logo bytes')
    )
    assert.equal(put.status, 200)
    const url = await content.getDownloadURL({
      bucket: 'site',
      key: 'logo.png',
      visibility: 'public',
    } as never)
    const got = await fetch(url)
    assert.equal(got.status, 200)
    assert.equal(await got.text(), 'logo bytes')
  })

  test('the same key public and private are two files and neither exposes the other', async () => {
    await upload({ bucket: 'dual', fileKey: 'k.txt' }, Buffer.from('secret'))
    await upload(
      { bucket: 'dual', fileKey: 'k.txt', visibility: 'public' },
      Buffer.from('open')
    )
    const publicUrl = await content.getDownloadURL({
      bucket: 'dual',
      key: 'k.txt',
      visibility: 'public',
    } as never)
    assert.equal(await (await fetch(publicUrl)).text(), 'open')
    assert.equal((await fetch(`${origin}/content/dual/k.txt`)).status, 403)
  })

  test('traversal out of the content root is refused over the wire', async () => {
    for (const path of [
      '/content/../../etc/passwd',
      '/content/%2e%2e/%2e%2e/etc/passwd',
      '/content/_public/../lib/a/private.txt',
    ]) {
      const response = await fetch(`${origin}${path}`)
      assert.notEqual(response.status, 200, path)
    }
  })

  test('an unsigned upload is refused and writes nothing', async () => {
    const before = allFiles(dir).length
    const put = await fetch(`${origin}/upload/lib/evil.txt`, {
      method: 'PUT',
      body: 'x',
    })
    assert.equal(put.status, 403)
    assert.equal(allFiles(dir).length, before)
  })

  test('an upload over the size limit gets 413 and leaves no file or partial behind', async () => {
    const config = {
      localFileUploadPath: join(dir, 'small'),
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/content',
      server: origin,
      sizeLimit: '2mb',
    }
    const small = new LocalContent(config, noopLogger, fakeJWT)
    const smallHandler = createLocalContentRequestHandler({
      content: config,
      logger: noopLogger,
      getJWT: () => fakeJWT,
    })
    const target = await small.getUploadURL({
      bucket: 'lib',
      fileKey: 'big.bin',
      contentType: 'application/octet-stream',
    })
    const response = await smallHandler(
      new Request(new URL(target.uploadUrl, origin), {
        method: 'PUT',
        body: Readable.toWeb(generated(8)) as never,
        duplex: 'half',
      } as RequestInit)
    )
    assert.equal(response?.status, 413)
    let leftovers: string[] = []
    try {
      leftovers = allFiles(join(dir, 'small'))
    } catch {}
    assert.deepEqual(leftovers, [])
  })

  test('a 300 MB upload and read stay streamed: memory does not grow with the file', async () => {
    const megabytes = 300
    const baseline = process.memoryUsage().rss
    let peak = baseline
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss)
    }, 20)

    const expected = createHash('sha256')
    for (let i = 0; i < megabytes; i++) expected.update(CHUNK)

    const put = await upload(
      { bucket: 'video', fileKey: 'big.bin' },
      generated(megabytes),
      megabytes * CHUNK.length
    )
    assert.equal(put.status, 200)

    const url = await content.signContentKey({
      bucket: 'video',
      contentKey: 'big.bin',
      dateLessThan: new Date(Date.now() + 60_000),
    })
    const got = await fetch(url)
    assert.equal(got.status, 200)
    const actual = createHash('sha256')
    let total = 0
    for await (const chunk of Readable.fromWeb(got.body as never)) {
      actual.update(chunk)
      total += chunk.length
    }
    clearInterval(sampler)

    assert.equal(total, megabytes * CHUNK.length)
    assert.equal(actual.digest('hex'), expected.digest('hex'))
    assert.equal(
      statSync(join(dir, 'private', 'video', 'big.bin')).size,
      megabytes * CHUNK.length
    )
    const growthMb = (peak - baseline) / (1024 * 1024)
    assert.ok(growthMb < 150, `rss grew ${growthMb.toFixed(0)} MB for a 300 MB file`)
  })
})
