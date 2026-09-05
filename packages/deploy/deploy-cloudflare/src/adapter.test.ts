import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { PlatformServiceContributor } from '@pikku/deploy'

import { CloudflareProviderAdapter } from './adapter.js'

const unit = {
  name: 'api',
  role: 'function',
  target: 'server',
  services: [
    { capability: 'queue', sourceServiceName: 'queueService' },
    { capability: 'kv', sourceServiceName: 'browser' },
  ],
  handlers: ['http', 'queue'],
  dependsOn: [],
} as never

const ctx = {
  unit,
  unitDir: '/build/api',
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

const queueBinding: PlatformServiceContributor = {
  name: 'queue-binding',
  requires: ['cloudflare'],
  imports: [`import { bindQueue } from './queue.js'`],
  emit: () => [`  services.queue = bindQueue(env.QUEUE)`],
}

describe('CloudflareProviderAdapter contributors', () => {
  test('a worker entry runs env and cloudflare contributors', () => {
    const source = new CloudflareProviderAdapter({
      contributors: [kysely, queueBinding],
    }).generateEntrySource(ctx)

    assert.match(source, /import { Kysely } from 'kysely'/)
    assert.match(source, /services\.kysely = new Kysely/)
    assert.match(source, /import { bindQueue } from '\.\/queue\.js'/)
    assert.match(source, /services\.queue = bindQueue\(env\.QUEUE\)/)
  })

  test('the container entry runs only contributors that live on env', () => {
    const source = new CloudflareProviderAdapter({
      contributors: [kysely, queueBinding],
    }).generateServerEntrySource(ctx)

    assert.match(source, /services\.kysely = new Kysely/)
    assert.doesNotMatch(source, /bindQueue/)
    assert.match(source, /\.\.\.platformServices,\n  }\)/)
  })

  test('a later contributor with the same name replaces the earlier one', () => {
    const source = new CloudflareProviderAdapter({
      contributors: [
        kysely,
        { ...kysely, emit: () => [`  services.kysely = replaced()`] },
      ],
    }).generateServerEntrySource(ctx)

    assert.match(source, /services\.kysely = replaced\(\)/)
    assert.doesNotMatch(source, /new Kysely/)
  })
})
