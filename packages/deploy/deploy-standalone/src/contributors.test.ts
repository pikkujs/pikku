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

describe(`StandaloneProviderAdapter contributors`, () => {
  test('without contributors the entry has no platform services block', () => {
    const source = new StandaloneProviderAdapter({}).generateEntrySource(ctx)

    assert.doesNotMatch(source, /createPlatformServices/)
    assert.doesNotMatch(source, /platformServices/)
  })

  test('contributor imports, lines and the spread are all emitted', () => {
    const source = new StandaloneProviderAdapter({
      contributors: [kysely, browser],
    }).generateEntrySource(ctx)

    assert.match(source, /import { Kysely } from 'kysely'/)
    assert.match(source, /import { Browser } from '\.\/browser\.js'/)
    assert.match(
      source,
      /const createPlatformServices = async \(env: Record<string, string \| undefined>, runtime: Record<string, any> = \{\}\): Promise<Record<string, unknown>> => \{/
    )
    assert.match(
      source,
      /if \(env\.DATABASE_URL\) services\.kysely = new Kysely\(\{\}\)/
    )
    assert.match(source, /services\.browser = new Browser\(env, logger\)/)
    assert.match(
      source,
      /const platformServices = await createPlatformServices\(process\.env as Record<string, string \| undefined>, \{ logger, schedulerService, queueService, workflowService, triggerService, triggerSourceStore, eventHub \}\)/
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
          contributors: [kysely, queueBinding],
        }),
      /standalone adapter only provides env bindings; unsupported contributors: queue-binding \(requires cloudflare\)/
    )
  })

  test('a contributor reading the database runs after it is opened', () => {
    const sources: PlatformServiceContributor = {
      name: 'sources',
      needs: ['kysely'],
      provides: ['logSources'],
      emit: () => [`  services.logSources = { workspace: runtime.kysely }`],
    }
    const source = new StandaloneProviderAdapter({
      contributors: [sources],
    }).generateEntrySource({
      ...(ctx as object),
      db: { engine: 'sqlite' },
    } as never)

    const call = source.indexOf('await createPlatformServices(')
    assert.ok(call > source.indexOf('const kysely ='))
    assert.match(
      source.slice(call),
      /^await createPlatformServices\(process\.env as Record<string, string \| undefined>, \{ logger, kysely, /
    )
  })

  test('a need neither the runtime nor a contributor meets fails generation', () => {
    const sources: PlatformServiceContributor = {
      name: 'sources',
      needs: ['kysely'],
      emit: () => [],
    }
    assert.throws(
      () =>
        new StandaloneProviderAdapter({
          contributors: [sources],
        }).generateEntrySource(ctx),
      /'sources' needs 'kysely', which nothing provides/
    )
  })

  test('contributors are emitted in dependency order', () => {
    const reader: PlatformServiceContributor = {
      name: 'reader',
      needs: ['cloudSession'],
      emit: () => [`  // reader`],
    }
    const session: PlatformServiceContributor = {
      name: 'session',
      provides: ['cloudSession'],
      emit: () => [`  // session`],
    }
    const source = new StandaloneProviderAdapter({
      contributors: [reader, session],
    }).generateEntrySource(ctx)
    assert.ok(source.indexOf('// session') < source.indexOf('// reader'))
  })
})
