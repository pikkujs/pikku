import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { B2Content } from './b2-content.js'

const logger = { info() {}, warn() {}, error() {}, debug() {} } as any

type Req = { url: string; body: any }
let requests: Req[]
const realFetch = globalThis.fetch
let files: Record<string, { fileName: string; fileId: string }[]>

beforeEach(() => {
  requests = []
  files = {
    priv: [
      { fileName: 'docs/p/1', fileId: 'id1' },
      { fileName: 'docs/p/2', fileId: 'id2' },
    ],
    pub: [{ fileName: 'docs/p/9', fileId: 'id9' }],
  }
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(init.body) : undefined
    requests.push({ url: u, body })
    const json = (v: unknown) => new Response(JSON.stringify(v))
    if (u.includes('b2_authorize_account')) {
      return json({
        authorizationToken: 't',
        apiUrl: 'https://api.test',
        downloadUrl: 'https://dl.test',
        accountId: 'acc',
      })
    }
    if (u.endsWith('b2_list_buckets')) {
      return json({
        buckets: [
          { bucketName: body.bucketId === 'pub' ? 'pubname' : 'privname' },
        ],
      })
    }
    if (u.endsWith('b2_get_upload_url')) {
      return json({
        uploadUrl: `https://up.test/${body.bucketId}`,
        authorizationToken: 'u',
      })
    }
    if (u.endsWith('b2_get_download_authorization')) {
      return json({ authorizationToken: 'dlauth' })
    }
    if (u.endsWith('b2_list_file_names')) {
      return json({
        files: files[body.bucketId].filter((f) =>
          f.fileName.startsWith(body.prefix)
        ),
      })
    }
    return json({})
  }) as any
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const two = () =>
  new B2Content(
    {
      applicationKeyId: 'k',
      applicationKey: 's',
      bucketId: 'priv',
      publicBucketId: 'pub',
    },
    logger
  )

describe('B2Content visibility', () => {
  test('with two buckets, public uploads go to the public bucket and private to the private one', async () => {
    const pub = await two().getUploadURL({
      bucket: 'docs',
      fileKey: 'a',
      contentType: 'text/plain',
      visibility: 'public',
    })
    const priv = await two().getUploadURL({
      bucket: 'docs',
      fileKey: 'a',
      contentType: 'text/plain',
    })
    assert.equal(pub.uploadUrl, 'https://up.test/pub')
    assert.equal(priv.uploadUrl, 'https://up.test/priv')
  })

  test('with one bucket, both visibilities use it', async () => {
    const one = new B2Content(
      { applicationKeyId: 'k', applicationKey: 's', bucketId: 'priv' },
      logger
    )
    const pub = await one.getUploadURL({
      bucket: 'docs',
      fileKey: 'a',
      contentType: 'text/plain',
      visibility: 'public',
    })
    assert.equal(pub.uploadUrl, 'https://up.test/priv')
  })

  test('a public download URL is plain, a private one carries an authorization', async () => {
    const pub = await two().getDownloadURL({
      bucket: 'docs',
      key: 'a',
      visibility: 'public',
    })
    assert.equal(pub, 'https://dl.test/file/pubname/docs/a')
    const priv = await two().getDownloadURL({ bucket: 'docs', key: 'a' })
    assert.equal(
      priv,
      'https://dl.test/file/privname/docs/a?Authorization=dlauth'
    )
  })

  test('list and delete by prefix use the bucket of the visibility', async () => {
    const b2 = two()
    assert.deepEqual(await b2.listFilesByPrefix('docs', 'p/'), ['p/1', 'p/2'])
    assert.deepEqual(await b2.listFilesByPrefix('docs', 'p/', 'public'), [
      'p/9',
    ])
    assert.equal(await b2.deleteByPrefix('docs', 'p/', 'public'), 1)
    const deleted = requests.filter((r) =>
      r.url.endsWith('b2_delete_file_version')
    )
    assert.deepEqual(
      deleted.map((r) => r.body),
      [{ fileName: 'docs/p/9', fileId: 'id9' }]
    )
  })
})
