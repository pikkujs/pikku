import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ContributorDependencyError,
  assertContributorsSupported,
  collectContributorImports,
  collectContributorLines,
  dedupeContributors,
  orderContributors,
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
    assert.deepEqual(
      collectContributorImports([kysely, browser], platform, ctx),
      [
        `import { Kysely } from 'kysely'`,
        `import { agentTables } from './agent.js'`,
        `import { Browser } from './browser.js'`,
      ]
    )
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

const node = (
  name: string,
  shape: { needs?: string[]; provides?: string[] } = {}
): PlatformServiceContributor => ({
  name,
  ...shape,
  emit: () => [`  // ${name}`],
})

const names = (list: PlatformServiceContributor[]) => list.map((c) => c.name)

describe('orderContributors', () => {
  test('without needs or provides the input order is kept', () => {
    assert.deepEqual(
      names(orderContributors([node('a'), node('b'), node('c')])),
      ['a', 'b', 'c']
    )
  })

  test('a contributor runs after the one providing its need', () => {
    const stage = node('stage', {
      needs: ['logSources', 'cloudSession'],
      provides: ['logSources.stage'],
    })
    const session = node('session', { provides: ['cloudSession'] })
    const workspace = node('workspace', {
      provides: ['logSources', 'logSources.workspace'],
    })
    const other = node('other')

    assert.deepEqual(
      names(orderContributors([stage, other, session, workspace])),
      ['other', 'session', 'workspace', 'stage']
    )
  })

  test('a dotted need is met by a provider of its prefix', () => {
    const reader = node('reader', { needs: ['logSources.workspace'] })
    const workspace = node('workspace', { provides: ['logSources'] })

    assert.deepEqual(names(orderContributors([reader, workspace])), [
      'workspace',
      'reader',
    ])
  })

  test('a need the runtime holds needs no contributor', () => {
    const sources = node('sources', { needs: ['kysely'] })

    assert.deepEqual(
      names(orderContributors([sources], { runtime: ['logger', 'kysely'] })),
      ['sources']
    )
  })

  test('a need nothing provides names the contributor, the need and the runtime', () => {
    const sources = node('sources', { needs: ['kysely'] })

    assert.throws(
      () => orderContributors([sources], { runtime: ['logger'] }),
      (error: unknown) =>
        error instanceof ContributorDependencyError &&
        /'sources' needs 'kysely', which nothing provides/.test(
          error.message
        ) &&
        /runtime only has: logger/.test(error.message)
    )
  })

  test('a need only met below its key names who provides the sub-keys', () => {
    const reader = node('reader', { needs: ['logSources'] })
    const stage = node('stage', { provides: ['logSources.stage'] })

    assert.throws(
      () => orderContributors([reader, stage]),
      /stage provides keys under it, but not 'logSources' itself/
    )
  })

  test('two contributors providing the same key is refused', () => {
    assert.throws(
      () =>
        orderContributors([
          node('a', { provides: ['logSources'] }),
          node('b', { provides: ['logSources'] }),
        ]),
      /'a' and 'b' both provide 'logSources'/
    )
  })

  test('a cycle is refused with its path', () => {
    assert.throws(
      () =>
        orderContributors([
          node('a', { needs: ['y'], provides: ['x'] }),
          node('b', { needs: ['x'], provides: ['y'] }),
        ]),
      /cycle: a -> b -> a/
    )
  })

  test('a contributor needing what it provides is a cycle', () => {
    assert.throws(
      () => orderContributors([node('a', { needs: ['x'], provides: ['x'] })]),
      /cycle: a -> a/
    )
  })

  test('collected lines follow the dependency order', () => {
    const reader = node('reader', { needs: ['logSources'] })
    const workspace = node('workspace', { provides: ['logSources'] })

    assert.deepEqual(
      collectContributorLines([reader, workspace], {
        ctx,
        platform,
        isGateway: false,
      }),
      ['  // workspace', '  // reader']
    )
  })

  test('runtime services come from the platform', () => {
    const sources = node('sources', { needs: ['kysely'] })

    assert.throws(() =>
      collectContributorLines([sources], { ctx, platform, isGateway: false })
    )
    assert.deepEqual(
      collectContributorLines([sources], {
        ctx,
        platform: { ...platform, runtimeServices: ['kysely'] },
        isGateway: false,
      }),
      ['  // sources']
    )
  })
})
