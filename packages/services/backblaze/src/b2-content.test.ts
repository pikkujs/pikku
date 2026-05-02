import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { B2Content } from './b2-content.js'

const config = {
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID!,
  applicationKey: process.env.B2_APPLICATION_KEY!,
  bucketId: process.env.B2_BUCKET_ID!,
}

const logger = {
  info: () => {},
  warn: () => {},
  error: console.error,
  debug: () => {},
}

describe('B2Content integration', async () => {
  if (!config.applicationKeyId || !config.applicationKey || !config.bucketId) {
    console.log(
      'Skipping B2 tests: set B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID'
    )
    return
  }

  const b2 = new B2Content(config, logger as any)
  const bucket = 'pikku-test'
  const testKey = `pikku-test-${Date.now()}.txt`
  const testContent = 'Hello from Pikku B2 integration test!'

  test('upload file via writeFile', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(testContent))
        controller.close()
      },
    })
    const result = await b2.writeFile({ bucket, key: testKey, stream })
    assert.ok(result, 'writeFile should return true')
  })

  test('readFileAsBuffer returns correct content', async () => {
    const buffer = await b2.readFileAsBuffer({ bucket, key: testKey })
    assert.equal(buffer.toString(), testContent)
  })

  test('readFile returns a stream', async () => {
    const stream = await b2.readFile({ bucket, key: testKey })
    const reader = (stream as ReadableStream).getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const result = Buffer.concat(chunks).toString()
    assert.equal(result, testContent)
  })

  test('signContentKey returns a download URL', async () => {
    const url = await b2.signContentKey({
      bucket,
      contentKey: testKey,
      dateLessThan: new Date(),
    })
    assert.ok(url.includes(testKey), 'URL should contain the file name')
    assert.ok(url.startsWith('https://'), 'URL should be https')
  })

  test('getUploadURL returns credentials with POST method', async () => {
    const info = await b2.getUploadURL({
      bucket,
      fileKey: 'test.txt',
      contentType: 'text/plain',
    })
    assert.ok(info.uploadUrl, 'Should have uploadUrl')
    assert.equal(info.assetKey, `${bucket}/test.txt`)
    assert.equal(info.uploadMethod, 'POST')
    assert.ok(info.uploadHeaders?.Authorization, 'Should have auth header')
    assert.ok(
      info.uploadHeaders?.['X-Bz-File-Name'],
      'Should have file name header'
    )
    assert.ok(
      info.uploadHeaders?.['Content-Type'],
      'Should have content type header'
    )
  })

  test('deleteFile removes the file', async () => {
    const result = await b2.deleteFile({ bucket, key: testKey })
    assert.ok(result, 'deleteFile should return true')
  })

  test('deleteFile returns false for non-existent file', async () => {
    const result = await b2.deleteFile({
      bucket,
      key: 'non-existent-file-12345.txt',
    })
    assert.equal(result, false)
  })
})
