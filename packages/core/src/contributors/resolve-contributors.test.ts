import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ContributorDependencyError,
  defineContributors,
  orderContributors,
  resolveContributors,
} from './index.js'
import type {
  Contributor,
  ContributorPlatform,
  NamedContributor,
} from './index.js'

const platform = (
  overrides: Partial<ContributorPlatform> = {}
): ContributorPlatform => ({
  serviceNames: [],
  needsQueue: false,
  needsWorkflow: false,
  needsAgent: false,
  ...overrides,
})

const entry = (
  name: string,
  contributor: Partial<Contributor> = {}
): NamedContributor => ({ name, contributor: { run() {}, ...contributor } })

const names = (entries: NamedContributor[]) => entries.map((e) => e.name)

describe('defineContributors', () => {
  test('returns its argument unchanged', () => {
    const input = { inbox: { dev: { run() {} } } }
    assert.equal(defineContributors(input), input)
  })
})

describe('orderContributors', () => {
  test('keeps input order when nothing declares needs', () => {
    const list = [entry('b'), entry('a'), entry('c')]
    assert.deepEqual(names(orderContributors(list)), ['b', 'a', 'c'])
  })

  test('runs a provider before the contributor that needs it', () => {
    const ordered = orderContributors([
      entry('analytics', { needs: ['queueService'] }),
      entry('queue', { provides: ['queueService'] }),
    ])
    assert.deepEqual(names(ordered), ['queue', 'analytics'])
  })

  test('a dotted need is met by a prefix provider', () => {
    const ordered = orderContributors([
      entry('stage', { needs: ['logSources.stage'] }),
      entry('sources', { provides: ['logSources'] }),
    ])
    assert.deepEqual(names(ordered), ['sources', 'stage'])
  })

  test('an unmet need names the contributor and the key', () => {
    assert.throws(
      () => orderContributors([entry('a', { needs: ['kysely'] })]),
      (e) =>
        e instanceof ContributorDependencyError &&
        /'a' needs 'kysely', which nothing provides/.test(e.message)
    )
  })

  test('a need met by a baseline runtime service is fine', () => {
    const ordered = orderContributors(
      [entry('a', { needs: ['queueService'] })],
      {
        runtime: ['queueService'],
      }
    )
    assert.deepEqual(names(ordered), ['a'])
  })

  test('a cycle is refused and names the path', () => {
    assert.throws(
      () =>
        orderContributors([
          entry('a', { provides: ['x'], needs: ['y'] }),
          entry('b', { provides: ['y'], needs: ['x'] }),
        ]),
      (e) =>
        e instanceof ContributorDependencyError &&
        /cycle: a -> b -> a/.test(e.message)
    )
  })

  test('a contributor needing what it provides is a cycle', () => {
    assert.throws(
      () => orderContributors([entry('a', { provides: ['x'], needs: ['x'] })]),
      ContributorDependencyError
    )
  })

  test('two providers of one key are refused, naming both', () => {
    assert.throws(
      () =>
        orderContributors([
          entry('one', { provides: ['queueService'] }),
          entry('two', { provides: ['queueService'] }),
        ]),
      (e) =>
        e instanceof ContributorDependencyError &&
        /'one' and 'two' both provide 'queueService'/.test(e.message)
    )
  })

  test('a repeated name is refused', () => {
    assert.throws(
      () => orderContributors([entry('a'), entry('a')]),
      /selected more than once/
    )
  })

  test('empty and missing provides are allowed and never clash', () => {
    const ordered = orderContributors([
      entry('decorator-a', { provides: [], needs: ['kysely'] }),
      entry('decorator-b', { needs: ['kysely'] }),
      entry('kysely', { provides: ['kysely'] }),
    ])
    assert.deepEqual(names(ordered), ['kysely', 'decorator-a', 'decorator-b'])
  })

  test('a contributor may replace a baseline runtime service', () => {
    const ordered = orderContributors(
      [entry('queue', { provides: ['queueService'] })],
      { runtime: ['queueService'] }
    )
    assert.deepEqual(names(ordered), ['queue'])
  })
})

describe('resolveContributors', () => {
  test('an exclusive when pair providing one key does not clash', () => {
    const pg = entry('kysely-postgres', {
      provides: ['kysely'],
      when: (p) => p.db?.engine === 'postgres',
    })
    const sqlite = entry('kysely-libsql', {
      provides: ['kysely'],
      when: (p) => p.db?.engine === 'sqlite',
    })
    const { ordered, skipped } = resolveContributors([pg, sqlite], {
      platform: platform({ db: { engine: 'postgres' } }),
    })
    assert.deepEqual(names(ordered), ['kysely-postgres'])
    assert.deepEqual(skipped, [{ name: 'kysely-libsql', reason: 'when' }])
  })

  test('the clash is checked after when filtering, so two live providers still fail', () => {
    assert.throws(
      () =>
        resolveContributors(
          [
            entry('a', { provides: ['kysely'], when: () => true }),
            entry('b', { provides: ['kysely'] }),
          ],
          { platform: platform() }
        ),
      /'a' and 'b' both provide 'kysely'/
    )
  })

  test('a filtered contributor that provides a need leaves it unmet', () => {
    assert.throws(
      () =>
        resolveContributors(
          [
            entry('kysely', { provides: ['kysely'], when: () => false }),
            entry('coercion', { needs: ['kysely'] }),
          ],
          { platform: platform() }
        ),
      /'coercion' needs 'kysely'/
    )
  })

  test('requires the target cannot supply is filtered out', () => {
    const { ordered, skipped } = resolveContributors(
      [entry('d1', { requires: ['cloudflare'] }), entry('plain')],
      { platform: platform(), supported: ['env'] }
    )
    assert.deepEqual(names(ordered), ['plain'])
    assert.deepEqual(skipped, [{ name: 'd1', reason: 'requires' }])
  })

  test('baseline runtimeServices from the platform meet needs and may be replaced', () => {
    const { ordered } = resolveContributors(
      [
        entry('reader', { needs: ['queueService'] }),
        entry('queue', { provides: ['queueService'] }),
      ],
      { platform: platform({ runtimeServices: ['queueService'] }) }
    )
    assert.deepEqual(names(ordered), ['queue', 'reader'])
  })

  test('a requires the target cannot supply is not reported when when already ruled the contributor out', () => {
    const { skipped } = resolveContributors(
      [entry('d1', { requires: ['cloudflare'], when: () => false })],
      { platform: platform(), supported: ['env'] }
    )
    assert.deepEqual(skipped, [{ name: 'd1', reason: 'when' }])
  })

  test('an optional contributor is dropped when nothing meets its need, kept when something does', () => {
    const wrap = entry('coercion', { needs: ['kysely'] })
    const optional = new Set(['coercion'])
    const dropped = resolveContributors([wrap], {
      platform: platform(),
      optional,
    })
    assert.deepEqual(names(dropped.ordered), [])
    assert.deepEqual(dropped.skipped, [{ name: 'coercion', reason: 'needs' }])

    const kept = resolveContributors(
      [wrap, entry('kysely', { provides: ['kysely'] })],
      { platform: platform(), optional }
    )
    assert.deepEqual(names(kept.ordered), ['kysely', 'coercion'])
    const baseline = resolveContributors([wrap], {
      platform: platform({ runtimeServices: ['kysely'] }),
      optional,
    })
    assert.deepEqual(names(baseline.ordered), ['coercion'])
  })

  test('a contributor that provides and needs the same key, baseline or not, is a cycle', () => {
    assert.throws(
      () =>
        resolveContributors(
          [entry('self', { provides: ['logger'], needs: ['logger'] })],
          { platform: platform({ runtimeServices: ['logger'] }) }
        ),
      /cycle: self -> self/
    )
  })
})
