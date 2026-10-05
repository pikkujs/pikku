import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { ScopedContentService } from './scoped-content-service.js'
import type { ContentService } from './content-service.js'

const recording = () => {
  const calls: any[] = []
  const record =
    (method: string, result: unknown) =>
    async (...args: any[]) => {
      calls.push({ method, args })
      return result
    }
  const service = {
    signContentKey: record('signContentKey', 'signed'),
    getUploadURL: record('getUploadURL', { uploadUrl: 'u', assetKey: 'k' }),
    deleteFile: record('deleteFile', true),
    writeFile: record('writeFile', true),
    readFile: record('readFile', null),
    readFileAsBuffer: record('readFileAsBuffer', Buffer.from('x')),
    getDownloadURL: record('getDownloadURL', 'url'),
    deleteByPrefix: record('deleteByPrefix', 3),
    listFilesByPrefix: async (bucket: string, prefix: string, v?: string) => {
      calls.push({ method: 'listFilesByPrefix', args: [bucket, prefix, v] })
      return [`${prefix}a`, `${prefix}ab/x`, 'other/z'].filter((k) =>
        k.startsWith(prefix)
      )
    },
  } as unknown as ContentService
  return { calls, service }
}

describe('a scoped content service passes visibility through unchanged', () => {
  for (const visibility of ['private', 'public'] as const) {
    test(`${visibility}: upload, write, delete, read, download`, async () => {
      const { calls, service } = recording()
      const scoped = new ScopedContentService(service, 'spindle')
      await scoped.getUploadURL({
        bucket: 'b',
        fileKey: 'k',
        contentType: 't',
        visibility,
      })
      await scoped.writeFile({
        bucket: 'b',
        key: 'k',
        stream: null as any,
        visibility,
      })
      await scoped.deleteFile({ bucket: 'b', key: 'k', visibility })
      await scoped.readFileAsBuffer({ bucket: 'b', key: 'k', visibility })
      await scoped.getDownloadURL({ bucket: 'b', key: 'k', visibility })
      await scoped.signContentKey({
        bucket: 'b',
        contentKey: 'k',
        dateLessThan: new Date(),
        visibility,
      })
      for (const c of calls) {
        const arg = c.args[0]
        assert.equal(arg.visibility, visibility, c.method)
        assert.equal(arg.bucket, 'spindle/b', c.method)
      }
    })
  }

  test('with no visibility given, none is added', async () => {
    const { calls, service } = recording()
    const scoped = new ScopedContentService(service, 'spindle')
    await scoped.getDownloadURL({ bucket: 'b', key: 'k' })
    assert.equal(calls[0].args[0].visibility, undefined)
  })
})

describe('prefix operations stay inside the addon', () => {
  test('list and delete are rewritten into the addon folder, with visibility', async () => {
    const { calls, service } = recording()
    const scoped = new ScopedContentService(service, 'spindle')
    await scoped.listFilesByPrefix('b', 'p/', 'public')
    assert.deepEqual(calls[0].args, ['spindle/b', 'p/', 'public'])
    calls.length = 0
    await scoped.deleteByPrefix('b', 'p/', 'public')
    assert.deepEqual(calls[0].args, ['spindle/b', 'p/', 'public'])
    const deletes = calls.filter((c) => c.method === 'deleteFile')
    assert.ok(deletes.length > 0)
    for (const d of deletes) {
      assert.equal(d.args[0].bucket, 'spindle/b')
      assert.equal(d.args[0].visibility, 'public')
    }
  })

  test('traversal in the bucket or prefix is refused', async () => {
    const { calls, service } = recording()
    const scoped = new ScopedContentService(service, 'spindle')
    for (const run of [
      () => scoped.listFilesByPrefix('../other', ''),
      () => scoped.listFilesByPrefix('b', '../x'),
      () => scoped.deleteByPrefix('b', '..'),
      () => scoped.deleteByPrefix('../other', ''),
      () => scoped.listFilesByPrefix('b', '%2e%2e/x'),
      () => scoped.listFilesByPrefix('/abs', ''),
    ]) {
      await assert.rejects(run, /denied/i)
    }
    assert.equal(calls.length, 0)
  })

  test('another addon folder is not reachable without a grant, for either visibility', async () => {
    const { calls, service } = recording()
    const scoped = new ScopedContentService(service, 'spindle')
    for (const visibility of ['private', 'public'] as const) {
      await assert.rejects(
        () => scoped.listFilesByPrefix('@diffui', '', visibility),
        /denied/i
      )
      await assert.rejects(
        () => scoped.deleteByPrefix('@diffui', '', visibility),
        /denied/i
      )
      await assert.rejects(
        () =>
          scoped.getDownloadURL({ bucket: '@diffui', key: 'a', visibility }),
        /denied/i
      )
    }
    assert.equal(calls.length, 0)
  })

  test('a read grant lists but cannot delete; a write grant does both', async () => {
    const { service } = recording()
    const scoped = new ScopedContentService(service, 'spindle', {
      'shared/ro': 'read',
      'shared/rw': 'write',
    })
    await scoped.listFilesByPrefix('@shared/ro', '')
    await assert.rejects(
      () => scoped.deleteByPrefix('@shared/ro', ''),
      /denied/i
    )
    await scoped.listFilesByPrefix('@shared/rw', '')
    await scoped.deleteByPrefix('@shared/rw', '')
    await assert.rejects(
      () => scoped.listFilesByPrefix('@shared', ''),
      /denied/i
    )
  })

  test('a prefix that spills past the grant lists only what the grant covers', async () => {
    const service = {
      listFilesByPrefix: async () => ['x', '../b/y', 'sub/z'],
    } as unknown as ContentService
    const scoped = new ScopedContentService(service, 'spindle', {
      'docs/a': 'read',
    })
    assert.deepEqual(await scoped.listFilesByPrefix('@docs/a', ''), [
      'x',
      'sub/z',
    ])
  })

  test('delete only removes files the addon may write, never a sibling that shares the prefix text', async () => {
    const deleted: string[] = []
    const service = {
      listFilesByPrefix: async () => ['x', '../b/y'],
      deleteFile: async (a: any) => {
        deleted.push(`${a.bucket}/${a.key}`)
        return true
      },
    } as unknown as ContentService
    const scoped = new ScopedContentService(service, 'spindle', {
      'docs/a': 'write',
    })
    const n = await scoped.deleteByPrefix('@docs/a', '')
    assert.equal(n, 1)
    assert.deepEqual(deleted, ['docs/a/x'])
  })
})
