import { after, describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as childProcess from 'node:child_process'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'

const realConfig = { ...configLib }
const realChildProcess = { ...childProcess }
let override = true
const artifact = Buffer.from('a gzipped tarball')

await mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? { apiUrl: 'https://cloud.test', token: 'user-token', project: null }
      : realConfig.resolveApiContext(opts),
}))

await mock.module('node:child_process', () => ({
  ...realChildProcess,
  execFileSync: (...args: any[]) => {
    if (!override || args[0] !== 'npm')
      return (realChildProcess.execFileSync as any)(...args)
    const dest = args[1][args[1].indexOf('--pack-destination') + 1]
    writeFileSync(join(dest, 'acme-a-1.0.0.tgz'), artifact)
    return JSON.stringify([{ filename: 'acme-a-1.0.0.tgz' }])
  },
}))

const realFetch = globalThis.fetch
after(() => {
  override = false
  globalThis.fetch = realFetch
})

const { CloudPublish } = await import('./publish.function.js')

describe('cloud publish', () => {
  test('declares the artifact size and uploads with the signed headers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-publish-test-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/a', version: '1.0.0' })
    )
    const requests: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      if (url.endsWith('/registry/addons/publish-url'))
        return Response.json({
          uploadUrl: 'https://r2.test/put',
          uploadHeaders: { 'Content-Type': 'application/gzip' },
          artifactKey: 'packages/acme-a/1.0.0-x.tgz',
          expiresInSeconds: 300,
        })
      if (url === 'https://r2.test/put') return new Response(null)
      return Response.json({ id: 'acme-a', name: '@acme/a', version: '1.0.0' })
    }) as typeof fetch

    const result = await CloudPublish.func(
      {} as any,
      { dir } as any,
      {
        rpc: { invoke: async () => ({ ok: true }) },
        cli: undefined,
      } as any
    )

    assert.strictEqual(result.id, 'acme-a')
    assert.deepStrictEqual(JSON.parse(String(requests[0]!.init.body)), {
      packageName: '@acme/a',
      version: '1.0.0',
      size: artifact.byteLength,
    })
    assert.strictEqual(requests[1]!.url, 'https://r2.test/put')
    assert.deepStrictEqual(requests[1]!.init.headers, {
      'Content-Type': 'application/gzip',
    })
  })
})
