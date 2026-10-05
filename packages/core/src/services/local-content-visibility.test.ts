import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'

import { LocalContent } from './local-content.js'
import { createLocalContentRequestHandler } from './local-content-request-handler.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
} as any

const jwt = {
  encode: async (_e: any, payload: any) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  decode: async (token: string) =>
    JSON.parse(Buffer.from(token, 'base64url').toString()),
} as any

let root: string
let content: LocalContent
let handle: ReturnType<typeof createLocalContentRequestHandler>

const config = () => ({
  localFileUploadPath: root,
  uploadUrlPrefix: '/up',
  assetUrlPrefix: '/assets',
  server: 'http://x.test',
  sizeLimit: '1mb',
})

const put = (bucket: string, key: string, body: string, visibility?: any) =>
  content.writeFile({
    bucket,
    key,
    visibility,
    stream: Readable.from([Buffer.from(body)]),
  })

const get = (url: string) => handle(new Request(url))

const future = () => new Date(Date.now() + 60_000)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pikku-vis-'))
  content = new LocalContent(config(), logger, jwt)
  handle = createLocalContentRequestHandler({
    content: config(),
    logger,
    getJWT: () => jwt,
  })
})

afterEach(() => rm(root, { recursive: true, force: true }))

describe('local content keeps public and private in separate folders', () => {
  test('the same bucket and key on both sides are two different files', async () => {
    await put('docs', 'a.txt', 'secret')
    await put('docs', 'a.txt', 'open', 'public')
    assert.equal(
      (
        await content.readFileAsBuffer({ bucket: 'docs', key: 'a.txt' })
      ).toString(),
      'secret'
    )
    assert.equal(
      (
        await content.readFileAsBuffer({
          bucket: 'docs',
          key: 'a.txt',
          visibility: 'public',
        })
      ).toString(),
      'open'
    )
    assert.ok(existsSync(join(root, 'private/docs/a.txt')))
    assert.ok(existsSync(join(root, 'public/docs/a.txt')))
  })

  test('visibility defaults to private', async () => {
    await put('docs', 'd.txt', 'x')
    assert.ok(existsSync(join(root, 'private/docs/d.txt')))
    assert.ok(!existsSync(join(root, 'public/docs/d.txt')))
  })

  test('deleting on one side leaves the other', async () => {
    await put('docs', 'a.txt', 'secret')
    await put('docs', 'a.txt', 'open', 'public')
    await content.deleteFile({
      bucket: 'docs',
      key: 'a.txt',
      visibility: 'public',
    })
    assert.ok(existsSync(join(root, 'private/docs/a.txt')))
    assert.ok(!existsSync(join(root, 'public/docs/a.txt')))
  })

  test('a key cannot climb from one side into the other', async () => {
    await put('docs', 'a.txt', 'secret')
    await assert.rejects(() =>
      content.readFileAsBuffer({
        bucket: 'docs',
        key: '../../private/docs/a.txt',
        visibility: 'public',
      })
    )
    await assert.rejects(() =>
      content.readFileAsBuffer({
        bucket: '../private/docs',
        key: 'a.txt',
        visibility: 'public',
      })
    )
    await assert.rejects(() =>
      content.readFileAsBuffer({
        bucket: '../public',
        key: 'x',
        visibility: 'private',
      })
    )
    await assert.rejects(() =>
      content.writeFile({
        bucket: 'docs',
        key: '../../../escape.txt',
        visibility: 'public',
        stream: Readable.from([Buffer.from('x')]),
      })
    )
  })

  test('a private bucket cannot be named _public', async () => {
    await assert.rejects(() => put('_public', 'x.txt', 'x'))
  })

  test('an unknown visibility is refused', async () => {
    await assert.rejects(() => put('docs', 'x.txt', 'x', 'shared'))
  })

  test('list and delete by prefix act on one side only', async () => {
    await put('docs', 'p/1.txt', '1')
    await put('docs', 'p/2.txt', '2')
    await put('docs', 'q/3.txt', '3')
    await put('docs', 'p/1.txt', 'pub', 'public')
    assert.deepEqual(await content.listFilesByPrefix('docs', 'p/'), [
      'p/1.txt',
      'p/2.txt',
    ])
    assert.deepEqual(await content.listFilesByPrefix('docs', 'p/', 'public'), [
      'p/1.txt',
    ])
    assert.equal(await content.deleteByPrefix('docs', 'p/'), 2)
    assert.deepEqual(await content.listFilesByPrefix('docs', ''), ['q/3.txt'])
    assert.deepEqual(await content.listFilesByPrefix('docs', '', 'public'), [
      'p/1.txt',
    ])
  })

  test('listing a bucket that does not exist is empty', async () => {
    assert.deepEqual(await content.listFilesByPrefix('none', ''), [])
    assert.equal(await content.deleteByPrefix('none', ''), 0)
  })

  test('a prefix cannot climb out of its side', async () => {
    await assert.rejects(() =>
      content.listFilesByPrefix('docs', '../../private', 'public')
    )
  })

  test('existing unprefixed files still read as private', async () => {
    await mkdir(join(root, 'old'), { recursive: true })
    await writeFile(join(root, 'old/legacy.txt'), 'legacy')
    assert.equal(
      (
        await content.readFileAsBuffer({ bucket: 'old', key: 'legacy.txt' })
      ).toString(),
      'legacy'
    )
    await assert.rejects(() =>
      content.readFileAsBuffer({
        bucket: 'old',
        key: 'legacy.txt',
        visibility: 'public',
      })
    )
  })
})

describe('the content route serves public unsigned and private only signed', () => {
  test('a public file is served with no signature', async () => {
    await put('docs', 'a.txt', 'open', 'public')
    const url = await content.getDownloadURL({
      bucket: 'docs',
      key: 'a.txt',
      visibility: 'public',
    })
    assert.equal(url, 'http://x.test/assets/_public/docs/a.txt')
    const res = await get(url)
    assert.equal(res?.status, 200)
    assert.equal(await res?.text(), 'open')
  })

  test('a private file without a signature is refused', async () => {
    await put('docs', 'a.txt', 'secret')
    const res = await get('http://x.test/assets/docs/a.txt')
    assert.equal(res?.status, 403)
  })

  test('a private file is served with its signed URL', async () => {
    await put('docs', 'a.txt', 'secret')
    const url = await content.getDownloadURL({ bucket: 'docs', key: 'a.txt' })
    assert.ok(url.includes('signature='))
    const res = await get(url)
    assert.equal(res?.status, 200)
    assert.equal(await res?.text(), 'secret')
  })

  test('the unsigned public route cannot reach private files', async () => {
    await put('docs', 'a.txt', 'secret')
    for (const path of [
      '/assets/_public/docs/a.txt',
      '/assets/_public/../private/docs/a.txt',
      '/assets/_public/%2e%2e/private/docs/a.txt',
      '/assets/_public/..%2fprivate/docs/a.txt',
      '/assets/_public/',
      '/assets/_public',
    ]) {
      const res = await get(`http://x.test${path}`)
      assert.notEqual(res?.status, 200, path)
      if (res?.status === 200) assert.notEqual(await res.text(), 'secret')
    }
  })

  test('a signature for a public path cannot be replayed for a private file', async () => {
    await put('docs', 'a.txt', 'secret')
    await put('docs', 'a.txt', 'open', 'public')
    const publicSigned = await content.signURL({
      url: 'http://x.test/assets/_public/docs/a.txt',
      dateLessThan: future(),
    })
    const params = new URL(publicSigned).search
    const res = await get(`http://x.test/assets/docs/a.txt${params}`)
    assert.equal(res?.status, 403)
  })

  test('a public bucket named private is still public', async () => {
    await put('private', 'a.txt', 'open', 'public')
    const res = await get('http://x.test/assets/_public/private/a.txt')
    assert.equal(await res?.text(), 'open')
  })

  test('an unsigned upload to the public route is refused', async () => {
    const res = await handle(
      new Request('http://x.test/up/_public/docs/new.txt', {
        method: 'PUT',
        body: 'x',
      })
    )
    assert.equal(res?.status, 403)
    assert.ok(!existsSync(join(root, 'public/docs/new.txt')))
  })

  test('a signed public upload lands in the public folder, a private one in the private folder', async () => {
    const pub = await content.getUploadURL({
      bucket: 'docs',
      fileKey: 'u.txt',
      contentType: 'text/plain',
      visibility: 'public',
    })
    const priv = await content.getUploadURL({
      bucket: 'docs',
      fileKey: 'u.txt',
      contentType: 'text/plain',
    })
    assert.equal(
      (
        await handle(
          new Request(`http://x.test${pub.uploadUrl}`, {
            method: 'PUT',
            body: 'pub',
          })
        )
      )?.status,
      200
    )
    assert.equal(
      (
        await handle(
          new Request(`http://x.test${priv.uploadUrl}`, {
            method: 'PUT',
            body: 'priv',
          })
        )
      )?.status,
      200
    )
    assert.equal(await readFile(join(root, 'public/docs/u.txt'), 'utf8'), 'pub')
    assert.equal(
      await readFile(join(root, 'private/docs/u.txt'), 'utf8'),
      'priv'
    )
  })

  test('a signed private upload url cannot be pointed at the public side', async () => {
    const priv = await content.getUploadURL({
      bucket: 'docs',
      fileKey: 'u.txt',
      contentType: 'text/plain',
    })
    const params = new URL(priv.uploadUrl, 'http://x.test').search
    const res = await handle(
      new Request(`http://x.test/up/_public/docs/u.txt${params}`, {
        method: 'PUT',
        body: 'x',
      })
    )
    assert.equal(res?.status, 403)
    assert.ok(!existsSync(join(root, 'public/docs/u.txt')))
  })

  test('a legacy unprefixed file is served signed, and public/ never falls back to it', async () => {
    await mkdir(join(root, 'old'), { recursive: true })
    await writeFile(join(root, 'old/legacy.txt'), 'legacy')
    const url = await content.getDownloadURL({
      bucket: 'old',
      key: 'legacy.txt',
    })
    assert.equal((await get(url))?.status, 200)
    assert.equal(
      (await get('http://x.test/assets/_public/old/legacy.txt'))?.status,
      404
    )
  })
})
