import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderError,
  ProviderRegistry,
  defineProvider,
  defineProviderCollection,
  runProviders,
} from './index.js'

const things = defineProviderCollection<'things', { n: number }>('things')
const meta = (needs: string[], provides: string[]) => ({
  common: { needs, provides },
})
const item = (n: number) =>
  defineProvider({ addTo: things, common: () => ({ n }) })

const reader = defineProvider(({ things }: any) => ({
  reader: things.map((entry: any) => entry.label),
}))

describe('provider collections', () => {
  test('zero contributors: a reader gets an empty list', async () => {
    const registry = new ProviderRegistry()
      .collection('things')
      .add('reader', reader, meta(['things'], ['reader']))
    const services: Record<string, any> = {}
    await runProviders(registry, { target: 'dev', services })
    assert.deepEqual(services.reader, [])
    assert.deepEqual(services.things, [])
  })

  test('one and many contributors: entries sorted by label, built before the reader', async () => {
    const registry = new ProviderRegistry()
      .add('reader', reader, meta(['things'], ['reader']))
      .add('zed', item(3), meta([], []))
      .add('alpha', item(1), meta([], []))
      .add('mid', item(2), meta([], []))
    const services: Record<string, any> = {}
    await runProviders(registry, { target: 'dev', services })
    assert.deepEqual(services.reader, ['alpha', 'mid', 'zed'])
    assert.deepEqual(
      services.things.map((entry: any) => entry.item.n),
      [1, 2, 3]
    )
  })

  test('the collection and its entries are frozen', async () => {
    const registry = new ProviderRegistry().add('a', item(1), meta([], []))
    const services: Record<string, any> = {}
    await runProviders(registry, { target: 'dev', services })
    assert.throws(
      () => services.things.push({ label: 'x', item: { n: 0 } }),
      TypeError
    )
    assert.throws(() => {
      'use strict'
      services.things[0].label = 'y'
    }, TypeError)
  })

  test('a contributor runs after its own needs', async () => {
    const dependent = defineProvider({
      addTo: things,
      common: ({ base }: any) => ({ n: base }),
    })
    const registry = new ProviderRegistry()
      .add('item', dependent, meta(['base'], []))
      .add(
        'base',
        defineProvider(() => ({ base: 7 })),
        meta([], ['base'])
      )
    const services: Record<string, any> = {}
    const { order } = await runProviders(registry, { target: 'dev', services })
    assert.deepEqual(order, ['base', 'item'])
    assert.equal(services.things[0].item.n, 7)
  })

  test('a reader that is also a contributor is a cycle', () => {
    const self = defineProvider({
      addTo: things,
      common: ({ things }: any) => ({ n: things.length }),
    })
    const registry = new ProviderRegistry().add(
      'self',
      self,
      meta(['things'], [])
    )
    assert.throws(
      () => registry.resolve('dev'),
      (error: unknown) =>
        error instanceof ProviderError && error.kind === 'cycle'
    )
  })

  test('a provider that provides the collection name is refused', () => {
    const registry = new ProviderRegistry().collection('things').add(
      'clash',
      defineProvider(() => ({ things: [] })),
      meta([], ['things'])
    )
    assert.throws(
      () => registry.resolve('dev'),
      (error: unknown) =>
        error instanceof ProviderError &&
        error.kind === 'collection-key-conflict'
    )
  })

  test('a contributor with no variant for the target adds nothing', async () => {
    const devOnly = defineProvider({ addTo: things, dev: () => ({ n: 1 }) })
    const registry = new ProviderRegistry()
      .add('devOnly', devOnly, { dev: { needs: [], provides: [] } })
      .add('reader', reader, meta(['things'], ['reader']))
    const services: Record<string, any> = {}
    await runProviders(registry, { target: 'deploy', services })
    assert.deepEqual(services.reader, [])
  })

  test('an item that returns nothing is refused', async () => {
    const registry = new ProviderRegistry().add(
      'empty',
      defineProvider({ addTo: things, common: () => undefined as never }),
      meta([], [])
    )
    await assert.rejects(
      () => runProviders(registry, { target: 'dev', services: {} }),
      /returned no item for collection 'things'/
    )
  })

  test('items stop in reverse resolved order, recorded as collection entries', async () => {
    const registry = new ProviderRegistry()
      .add('a', item(1), meta([], []))
      .add('b', item(2), meta([], []))
      .add('reader', reader, meta(['things'], ['reader']))
    const { stopOrder } = await runProviders(registry, {
      target: 'dev',
      services: {},
    })
    assert.deepEqual(stopOrder, [
      'reader',
      { collection: 'things', label: 'b' },
      { collection: 'things', label: 'a' },
    ])
  })
})
