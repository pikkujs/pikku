import { test, describe, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { S3Content } from './s3-content.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any

process.env.AWS_ACCESS_KEY_ID ??= 'AKIATEST'
process.env.AWS_SECRET_ACCESS_KEY ??= 'secret'

const make = (extra: Record<string, unknown> = {}) =>
  new S3Content(
    { bucketName: 'cdn.example.com', region: 'eu-west-1', ...extra },
    logger,
    { keyPairId: 'k', privateKey: 'p' }
  )

const signedHeaders = (url: string) =>
  (new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';')

describe('S3Content visibility', () => {
  let s3: S3Content
  beforeEach(() => {
    s3 = make()
  })

  test('a public upload signs the x-amz-acl header and returns it to send', async () => {
    const r = await s3.getUploadURL({
      bucket: 'docs',
      fileKey: 'a.png',
      contentType: 'image/png',
      visibility: 'public',
    })
    assert.deepEqual(r.uploadHeaders, { 'x-amz-acl': 'public-read' })
    assert.ok(signedHeaders(r.uploadUrl).includes('x-amz-acl'))
    assert.equal(new URL(r.uploadUrl).searchParams.get('x-amz-acl'), null)
  })

  test('a private upload carries no ACL', async () => {
    for (const visibility of [undefined, 'private'] as const) {
      const r = await s3.getUploadURL({
        bucket: 'docs',
        fileKey: 'a.png',
        contentType: 'image/png',
        visibility,
      })
      assert.equal(r.uploadHeaders, undefined)
      assert.ok(!signedHeaders(r.uploadUrl).includes('x-amz-acl'))
      assert.equal(new URL(r.uploadUrl).searchParams.get('x-amz-acl'), null)
    }
  })

  test('a public download URL is plain, a private one is not', async () => {
    assert.equal(
      await s3.getDownloadURL({
        bucket: 'docs',
        key: 'a.png',
        visibility: 'public',
      }),
      'https://cdn.example.com/docs/a.png'
    )
    assert.equal(
      await make({ publicBaseUrl: 'https://pub.example.com/' }).getDownloadURL({
        bucket: 'docs',
        key: 'a.png',
        visibility: 'public',
      }),
      'https://pub.example.com/docs/a.png'
    )
  })

  test('a public write sends the ACL, a private one does not', async () => {
    const sent: any[] = []
    ;(s3 as any).s3.send = async (c: any) => {
      sent.push(c.input)
      return {}
    }
    const stream = () => new Readable({ read() {} })
    await s3.writeFile({
      bucket: 'docs',
      key: 'a',
      stream: stream(),
      visibility: 'public',
    })
    await s3.writeFile({ bucket: 'docs', key: 'b', stream: stream() })
    assert.equal(sent[0].ACL, 'public-read')
    assert.equal(sent[1].ACL, undefined)
  })

  test('a bucket that refuses ACLs gives a clear error', async () => {
    ;(s3 as any).s3.send = async () => {
      throw Object.assign(new Error('x'), {
        name: 'AccessControlListNotSupported',
      })
    }
    await assert.rejects(
      () =>
        s3.writeFile({
          bucket: 'docs',
          key: 'a',
          stream: new Readable({ read() {} }),
          visibility: 'public',
        }),
      /does not allow ACLs/
    )
  })

  test('list and delete by prefix stay inside the logical bucket', async () => {
    const sent: any[] = []
    ;(s3 as any).s3.send = async (c: any) => {
      sent.push([c.constructor.name, c.input])
      if (c.constructor.name === 'ListObjectsV2Command') {
        return {
          Contents: [{ Key: 'docs/p/1' }, { Key: 'docs/p/2' }],
          IsTruncated: false,
        }
      }
      return {}
    }
    assert.deepEqual(await s3.listFilesByPrefix('docs', 'p/'), ['p/1', 'p/2'])
    assert.equal(sent[0][1].Prefix, 'docs/p/')
    assert.equal(await s3.deleteByPrefix('docs', 'p/'), 2)
    const del = sent.find(([n]) => n === 'DeleteObjectsCommand')[1]
    assert.deepEqual(del.Delete.Objects, [
      { Key: 'docs/p/1' },
      { Key: 'docs/p/2' },
    ])
  })
})
