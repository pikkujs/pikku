import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_COMPAT_DATE,
  cloudflareBuiltinsFor,
  getCloudflareRuntimeProfile,
} from './runtime-profile.js'
import { CloudflareProviderAdapter } from './adapter.js'
import { generateWranglerToml } from './wrangler-toml.js'
import { buildWorkerMetadataPayload } from './workers.js'

describe('Cloudflare runtime profile', () => {
  it('serverless gets nodejs_compat_v2 and the date it was uploaded with', () => {
    const p = getCloudflareRuntimeProfile('serverless')
    assert.deepEqual(
      [p.tier, p.compatDate, p.compatFlags],
      ['serverless', DEFAULT_COMPAT_DATE, ['nodejs_compat_v2']]
    )
    assert.ok(p.allowedBuiltins.includes('crypto'))
    assert.ok(p.allowedBuiltins.includes('async_hooks'))
  })

  it('edge gets no flags, no built-ins and no node: externals', () => {
    const p = getCloudflareRuntimeProfile('edge')
    assert.deepEqual(p.compatFlags, [])
    assert.deepEqual(p.allowedBuiltins, [])
    assert.ok(p.externals.every((e) => !e.startsWith('node:')))
    assert.ok(p.externals.includes('cloudflare:*'))
  })

  it('keys built-ins by compat date: os and fs appear only from 2025-09-15', () => {
    assert.ok(!cloudflareBuiltinsFor('2024-12-18').includes('os'))
    assert.ok(!cloudflareBuiltinsFor('2025-09-14').includes('os'))
    assert.ok(cloudflareBuiltinsFor('2025-09-15').includes('os'))
    assert.ok(!cloudflareBuiltinsFor('2025-08-14').includes('http'))
    assert.ok(cloudflareBuiltinsFor('2025-08-15').includes('http'))
  })

  it('keeps stubbed built-ins out of the externals so the stub can take them', () => {
    const p = getCloudflareRuntimeProfile('serverless', '2025-10-01')
    assert.ok(p.allowedBuiltins.includes('fs'))
    assert.ok(!p.externals.includes('node:fs'))
    assert.ok(p.externals.includes('node:crypto'))
  })

  it('has no server tier', () => {
    assert.throws(() => getCloudflareRuntimeProfile('server'))
  })

  it('the adapter and wrangler.toml derive from the one profile', () => {
    const adapter = new CloudflareProviderAdapter({ compatDate: '2025-10-01' })
    const profile = adapter.getRuntimeProfile()
    assert.equal(profile.compatDate, '2025-10-01')
    assert.deepEqual(adapter.getExternals(), profile.externals)
    assert.ok(adapter.getStubModules().includes('^(node:)?child_process$'))
    const toml = generateWranglerToml(
      {
        name: 'u',
        role: 'function',
        target: 'serverless',
        services: [],
        dependsOn: [],
        handlers: [],
      } as never,
      { secrets: [], queues: [], scheduledTasks: [] } as never,
      'p',
      profile
    )
    assert.match(toml, /compatibility_date = "2025-10-01"/)
    assert.match(toml, /compatibility_flags = \["nodejs_compat_v2"\]/)
  })

  // Fabric's live workers are uploaded with nodejs_compat_v2 and 2024-12-18
  // (its own uploader, and `wrangler.toml` here). Changing either alters the
  // runtime of every deployed worker, so the literals are pinned.
  it('pins the default to nodejs_compat_v2 and 2024-12-18 on every path', () => {
    assert.equal(DEFAULT_COMPAT_DATE, '2024-12-18')
    const p = getCloudflareRuntimeProfile()
    assert.equal(p.compatDate, '2024-12-18')
    assert.deepEqual(p.compatFlags, ['nodejs_compat_v2'])
    assert.ok(!p.allowedBuiltins.includes('os'))
    assert.ok(!p.allowedBuiltins.includes('fs'))
    assert.deepEqual(new CloudflareProviderAdapter().getRuntimeProfile(), p)

    const upload = buildWorkerMetadataPayload([])
    assert.equal(upload.compatibility_date, '2024-12-18')
    assert.deepEqual(upload.compatibility_flags, ['nodejs_compat_v2'])
  })

  it('a newer compat date is opt-in and unlocks built-ins through the same profile', () => {
    const adapter = new CloudflareProviderAdapter({ compatDate: '2025-09-15' })
    const p = adapter.getRuntimeProfile()
    assert.equal(p.compatDate, '2025-09-15')
    assert.ok(p.allowedBuiltins.includes('os'))
    const upload = buildWorkerMetadataPayload([], '2025-09-15')
    assert.equal(upload.compatibility_date, '2025-09-15')
    assert.deepEqual(upload.compatibility_flags, ['nodejs_compat_v2'])
  })
})
