import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderError,
  ProviderRegistry,
  defineProvider,
  defineProviderCollection,
  runProviders,
} from './index.js'

const meta = (
  needs: string[],
  provides: string[],
  optionalProvides: string[] = []
) => ({ common: { needs, optional: [], provides, optionalProvides } })

const failure = async (run: () => unknown) => {
  try {
    await run()
  } catch (error) {
    assert.ok(error instanceof ProviderError, String(error))
    return { kind: error.kind, message: error.message }
  }
  return assert.fail('expected a ProviderError')
}

const things = defineProviderCollection<'things', { n: number }>('things')

describe('every runtime ProviderError kind has one exact message', () => {
  test('duplicate-name, a provider registered twice', async () => {
    assert.deepEqual(
      await failure(() =>
        new ProviderRegistry()
          .add('a', (() => ({ a: 1 })) as never, meta([], ['a']))
          .add('a', (() => ({ a: 1 })) as never, meta([], ['a']))
      ),
      {
        kind: 'duplicate-name',
        message: "Provider 'a' is registered more than once.",
      }
    )
  })

  test('duplicate-provider', async () => {
    const registry = new ProviderRegistry()
      .add('a', (() => ({ k: 1 })) as never, meta([], ['k']))
      .add('b', (() => ({ k: 2 })) as never, meta([], ['k']))
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      {
        kind: 'duplicate-provider',
        message:
          "Providers 'a' and 'b' both provide 'k' on dev. Each key has one provider.",
      }
    )
  })

  test('collection-key-conflict', async () => {
    const registry = new ProviderRegistry()
      .collection('things')
      .add('a', (() => ({ things: 1 })) as never, meta([], ['things']))
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      {
        kind: 'collection-key-conflict',
        message:
          "'things' is a provider collection; provider 'a' cannot also provide it as a key.",
      }
    )
  })

  test('unsatisfied-need', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      (() => ({ a: 1 })) as never,
      meta(['ghost'], ['a'])
    )
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {}, baseline: [] })
      ),
      {
        kind: 'unsatisfied-need',
        message:
          "Provider 'a' needs 'ghost' on dev, which nothing provides. No provider provides it, and there is no baseline. List it in optional if the provider works without it.",
      }
    )
  })

  test('cycle', async () => {
    const registry = new ProviderRegistry()
      .add('a', (() => ({ a: 1 })) as never, meta(['b'], ['a']))
      .add('b', (() => ({ b: 1 })) as never, meta(['a'], ['b']))
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      {
        kind: 'cycle',
        message:
          'Providers depend on each other in a cycle on dev: a -> b -> a',
      }
    )
  })

  test('optional-key-needed', async () => {
    const registry = new ProviderRegistry()
      .add('maybe', (() => ({})) as never, meta([], ['k'], ['k']))
      .add('c', (() => ({ c: 1 })) as never, meta(['k'], ['c']))
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      {
        kind: 'optional-key-needed',
        message:
          "Provider 'c' needs 'k', which 'maybe' provides only sometimes. Add 'k' to its optional list.",
      }
    )
  })

  test('undeclared-return', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      (() => ({ a: 1, extra: 2 })) as never,
      meta([], ['a'])
    )
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      {
        kind: 'undeclared-return',
        message:
          "Provider 'a' returned 'extra', which its return type does not declare. It provides: a.",
      }
    )
  })

  test('missing-return, for a key and for a collection item', async () => {
    const key = new ProviderRegistry().add(
      'a',
      (() => ({})) as never,
      meta([], ['a'])
    )
    assert.deepEqual(
      await failure(() => runProviders(key, { target: 'dev', services: {} })),
      {
        kind: 'missing-return',
        message:
          "Provider 'a' did not return 'a', which its return type requires.",
      }
    )
    const item = new ProviderRegistry().add(
      'a',
      defineProvider({ addTo: things, common: () => undefined as never }),
      meta([], [])
    )
    assert.deepEqual(
      await failure(() => runProviders(item, { target: 'dev', services: {} })),
      {
        kind: 'missing-return',
        message: "Provider 'a' returned no item for collection 'things'.",
      }
    )
  })

  test('factory-failed', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      (() => {
        throw new Error('no db')
      }) as never,
      meta([], ['a'])
    )
    assert.deepEqual(
      await failure(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      { kind: 'factory-failed', message: "Provider 'a' failed to build: no db" }
    )
  })
})
