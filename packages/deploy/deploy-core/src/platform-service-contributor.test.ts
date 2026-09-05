import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assertContributorsSupported,
  collectContributorImports,
  collectContributorLines,
  dedupeContributors,
  partitionContributors,
  type ContributorPlatform,
  type PlatformServiceContributor,
} from './platform-service-contributor.js'

const platform: ContributorPlatform = {
  serviceNames: ['browser'],
  needsQueue: false,
  needsWorkflow: false,
  needsAgent: true,
}

const ctx = { unit: { name: 'app', role: 'function' } } as never

const kysely: PlatformServiceContributor = {
  name: 'kysely',
  imports: (p) => [
    `import { Kysely } from 'kysely'`,
    ...(p.needsAgent ? [`import { agentTables } from './agent.js'`] : []),
  ],
  emit: () => [`  services.kysely = new Kysely({})`],
}

const browser: PlatformServiceContributor = {
  name: 'browser',
  imports: [
    `import { Kysely } from 'kysely'`,
    `import { Browser } from './browser.js'`,
  ],
  emit: ({ isGateway }) =>
    isGateway ? [] : [`  services.browser = new Browser()`],
}

const queue: PlatformServiceContributor = {
  name: 'queue',
  requires: ['cloudflare'],
  emit: () => [`  services.queue = env.QUEUE`],
}

describe('platform service contributors', () => {
  test('dedupe keeps the last contributor registered under a name', () => {
    const replacement: PlatformServiceContributor = {
      ...browser,
      emit: () => ['  replaced'],
    }
    const result = dedupeContributors([kysely, browser, replacement])

    assert.deepEqual(
      result.map((c) => c.name),
      ['kysely', 'browser']
    )
    assert.deepEqual(result[1]!.emit({ ctx, platform, isGateway: false }), [
      '  replaced',
    ])
  })

  test('imports are resolved against the platform and de-duplicated', () => {
    assert.deepEqual(collectContributorImports([kysely, browser], platform), [
      `import { Kysely } from 'kysely'`,
      `import { agentTables } from './agent.js'`,
      `import { Browser } from './browser.js'`,
    ])
  })

  test('lines are emitted in registration order and empty emits vanish', () => {
    assert.deepEqual(
      collectContributorLines([kysely, browser], {
        ctx,
        platform,
        isGateway: true,
      }),
      [`  services.kysely = new Kysely({})`]
    )
  })

  test('a contributor without requires needs only env bindings', () => {
    const { supported, unsupported } = partitionContributors(
      [kysely, queue],
      ['env']
    )

    assert.deepEqual(
      supported.map((c) => c.name),
      ['kysely']
    )
    assert.deepEqual(
      unsupported.map((c) => c.name),
      ['queue']
    )
  })

  test('an adapter that cannot satisfy a contributor names it', () => {
    assert.throws(
      () => assertContributorsSupported([kysely, queue], ['env'], 'standalone'),
      /standalone adapter only provides env bindings; unsupported contributors: queue \(requires cloudflare\)/
    )
    assert.doesNotThrow(() =>
      assertContributorsSupported(
        [kysely, queue],
        ['env', 'cloudflare'],
        'cloudflare'
      )
    )
  })
})
