import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { runDevProxyChecks } from './dev-proxy-checks.js'

const config = (api: string) => `export default {
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
      '/api': {
        target: 'http://localhost:3000',
        ${api}
        changeOrigin: false,
      },
    },
  },
}`

const run = (source: string, originLockOn = true) =>
  runDevProxyChecks({
    root: '/project',
    originLockOn,
    viteConfigs: ['apps/app/vite.config.ts'],
    read: async () => source,
  })

describe('dev proxy checks', () => {
  test('reports an /api proxy without xfwd', async () => {
    const findings = await run(config(''))
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'dev-proxy-missing-xfwd')
    assert.equal(findings[0]!.severity, 'error')
  })

  test('says nothing when the /api proxy sets xfwd: true', async () => {
    assert.deepEqual(await run(config('xfwd: true,')), [])
  })

  test('says nothing when the origin lock is off', async () => {
    assert.deepEqual(await run(config(''), false), [])
  })

  test('says nothing when there is no /api proxy', async () => {
    assert.deepEqual(await run('export default {}'), [])
  })
})
