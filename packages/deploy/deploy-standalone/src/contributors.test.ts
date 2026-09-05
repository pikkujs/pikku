import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { PlatformServiceContributor } from '@pikku/deploy'

import { StandaloneProviderAdapter } from './adapter.js'

const ctx = {
  unit: {
    name: 'app',
    role: 'function',
    services: [{ capability: 'kv', sourceServiceName: 'browser' }],
  },
  unitDir: '/build/app',
  bootstrapPath: './.pikku/pikku-bootstrap.gen.js',
  configImport: `import { createConfig } from './config.js'`,
  configVar: 'createConfig',
  servicesImport: `import { createSingletonServices } from './services.js'`,
  servicesVar: 'createSingletonServices',
  singletonServicesImport: '',
  servicesType: 'Record<string, unknown>',
  mcpImport: '',
  mcpServerOption: '',
} as never

const kysely: PlatformServiceContributor = {
  name: 'kysely',
  imports: [`import { Kysely } from 'kysely'`],
  emit: () => [`  if (env.DATABASE_URL) services.kysely = new Kysely({})`],
}

const browser: PlatformServiceContributor = {
  name: 'browser',
  imports: (platform) =>
    platform.serviceNames.includes('browser')
      ? [`import { Browser } from './browser.js'`]
      : [],
  emit: () => [`  services.browser = new Browser(env, logger)`],
}

const queueBinding: PlatformServiceContributor = {
  name: 'queue-binding',
  requires: ['cloudflare'],
  emit: () => [`  services.queue = env.QUEUE`],
}

for (const runtime of ['node', 'bun'] as const) {
  describe(`StandaloneProviderAdapter contributors (${runtime})`, () => {
    test('without contributors the entry has no platform services block', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(ctx)

      assert.doesNotMatch(source, /createPlatformServices/)
      assert.doesNotMatch(source, /platformServices/)
    })

    test('contributor imports, lines and the spread are all emitted', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
        contributors: [kysely, browser],
      }).generateEntrySource(ctx)

      assert.match(source, /import { Kysely } from 'kysely'/)
      assert.match(source, /import { Browser } from '\.\/browser\.js'/)
      assert.match(
        source,
        /const createPlatformServices = async \(env: Record<string, string \| undefined>\): Promise<Record<string, unknown>> => \{/
      )
      assert.match(
        source,
        /if \(env\.DATABASE_URL\) services\.kysely = new Kysely\(\{\}\)/
      )
      assert.match(source, /services\.browser = new Browser\(env, logger\)/)
      assert.match(
        source,
        /const platformServices = await createPlatformServices\(process\.env as Record<string, string \| undefined>\)/
      )
      assert.match(
        source,
        /eventHub,\n    \.\.\.platformServices,\n  \}\)/,
        'contributed services must be spread last so they override the defaults'
      )
    })

    test('a contributor that needs cloudflare bindings is refused up front', () => {
      assert.throws(
        () =>
          new StandaloneProviderAdapter({
            runtime,
            contributors: [kysely, queueBinding],
          }),
        /standalone adapter only provides env bindings; unsupported contributors: queue-binding \(requires cloudflare\)/
      )
    })
  })
}
