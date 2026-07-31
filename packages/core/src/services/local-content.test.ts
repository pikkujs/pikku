import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { LocalContent, signedContentPath } from './local-content.js'

const createLogger = () =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    setLevel: () => {},
  }) as any

type CapturedPayload = {
  signedAt: number
  expiresAt: number
  notBefore?: number
  path?: string
}

const createContent = (
  overrides: Partial<{ server?: string; assetUrlPrefix: string }> = {}
) => {
  let capturedPayload: CapturedPayload | undefined
  const content = new LocalContent(
    {
      localFileUploadPath: '/tmp/uploads',
      uploadUrlPrefix: '/reaper',
      assetUrlPrefix: overrides.assetUrlPrefix ?? '/assets',
      server:
        'server' in overrides ? overrides.server : 'http://localhost:3000',
    },
    createLogger(),
    {
      encode: async (_expiresIn: any, payload: any) => {
        capturedPayload = payload
        return 'signed-token'
      },
      decode: async () => ({}) as any,
    }
  )
  return {
    content,
    getPayload: () => capturedPayload,
  }
}

describe('LocalContent signing', () => {
  test('binds notBefore into the signature payload', async () => {
    const { content, getPayload } = createContent()

    const dateGreaterThan = new Date(Date.now() + 60_000)
    const dateLessThan = new Date(Date.now() + 120_000)
    const signedUrl = await content.signContentKey({
      bucket: 'avatars',
      contentKey: 'user-1.png',
      dateLessThan,
      dateGreaterThan,
    })

    const url = new URL(signedUrl)
    assert.equal(url.searchParams.get('signature'), 'signed-token')
    const capturedPayload = getPayload()
    assert.ok(capturedPayload)
    assert.equal(capturedPayload?.expiresAt, dateLessThan.getTime())
    assert.equal(capturedPayload?.notBefore, dateGreaterThan.getTime())
    assert.equal(
      url.searchParams.get('notBefore'),
      String(dateGreaterThan.getTime())
    )
  })

  test('binds the asset path into the signature payload', async () => {
    const { content, getPayload } = createContent()

    const signedUrl = await content.signContentKey({
      bucket: 'avatars',
      contentKey: 'user-1.png',
      dateLessThan: new Date(Date.now() + 60_000),
    })

    assert.equal(getPayload()?.path, '/assets/avatars/user-1.png')
    assert.equal(
      new URL(signedUrl).pathname,
      '/assets/avatars/user-1.png',
      'the bound path must be the path the server will receive'
    )
  })

  test('two different content keys never share a bound path', async () => {
    const { content, getPayload } = createContent()

    await content.signContentKey({
      bucket: 'avatars',
      contentKey: 'user-1.png',
      dateLessThan: new Date(Date.now() + 60_000),
    })
    const first = getPayload()?.path

    await content.signContentKey({
      bucket: 'private',
      contentKey: 'passport-scan.png',
      dateLessThan: new Date(Date.now() + 60_000),
    })
    const second = getPayload()?.path

    assert.ok(first)
    assert.notEqual(first, second)
  })

  test('binds nested and space-containing keys to their decoded path', async () => {
    const { content, getPayload } = createContent()

    const signedUrl = await content.signContentKey({
      bucket: 'avatars',
      contentKey: 'nested/deep/my file (1).png',
      dateLessThan: new Date(Date.now() + 60_000),
    })

    const url = new URL(signedUrl)
    assert.equal(
      getPayload()?.path,
      '/assets/avatars/nested/deep/my file (1).png'
    )
    assert.equal(
      decodeURIComponent(url.pathname),
      getPayload()?.path,
      'the signed path must match the decoded pathname the server receives'
    )
  })

  test('binds the path when no server origin is configured', async () => {
    const { content, getPayload } = createContent({ server: undefined })

    const signedUrl = await content.signContentKey({
      bucket: 'avatars',
      contentKey: 'user-1.png',
      dateLessThan: new Date(Date.now() + 60_000),
    })

    assert.equal(getPayload()?.path, '/assets/avatars/user-1.png')
    assert.ok(signedUrl.startsWith('/assets/avatars/user-1.png?'))
  })

  test('signURL binds the path of the url it signs', async () => {
    const { content, getPayload } = createContent()

    await content.signURL({
      url: 'http://localhost:3000/assets/avatars/user-1.png',
      dateLessThan: new Date(Date.now() + 60_000),
    })

    assert.equal(getPayload()?.path, '/assets/avatars/user-1.png')
  })

  test('refuses to construct without a JWT service', () => {
    assert.throws(
      () =>
        new LocalContent(
          {
            localFileUploadPath: '/tmp/uploads',
            uploadUrlPrefix: '/reaper',
            assetUrlPrefix: '/assets',
          },
          createLogger(),
          undefined as any
        ),
      /JWTService/
    )
  })
})

describe('signedContentPath', () => {
  test('strips the origin and query, and decodes the path', () => {
    assert.equal(
      signedContentPath('http://localhost:3000/assets/a/b%20c.png?x=1'),
      '/assets/a/b c.png'
    )
    assert.equal(signedContentPath('/assets/a/b%20c.png'), '/assets/a/b c.png')
  })

  test('is stable for a malformed percent escape', () => {
    assert.equal(signedContentPath('/assets/100%.png'), '/assets/100%.png')
  })
})
