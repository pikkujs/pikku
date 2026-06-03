import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { LocalContent } from './local-content.js'

describe('LocalContent signing', () => {
  test('binds notBefore into the signature payload', async () => {
    let capturedPayload:
      | { signedAt: number; expiresAt: number; notBefore?: number }
      | undefined

    const content = new LocalContent(
      {
        localFileUploadPath: '/tmp/uploads',
        uploadUrlPrefix: '/reaper',
        assetUrlPrefix: '/assets',
        server: 'http://localhost:3000',
      },
      {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        setLevel: () => {},
      } as any,
      {
        encode: async (_expiresIn: any, payload: any) => {
          capturedPayload = payload
          return 'signed-token'
        },
        decode: async () => ({}),
      }
    )

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
    assert.ok(capturedPayload)
    assert.equal(capturedPayload?.expiresAt, dateLessThan.getTime())
    assert.equal(capturedPayload?.notBefore, dateGreaterThan.getTime())
    assert.equal(
      url.searchParams.get('notBefore'),
      String(dateGreaterThan.getTime())
    )
  })
})
