import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ProviderRegistry, WireProviders } from './index.js'
import type { ProviderError } from './index.js'

const meta = (
  needs: string[],
  provides: string[],
  extra: { optional?: string[]; optionalProvides?: string[] } = {}
) => ({
  common: {
    needs,
    optional: extra.optional ?? [],
    provides,
    optionalProvides: extra.optionalProvides ?? [],
  },
})

const logger = { error: () => {} }
const wire = { session: { userId: 'u1' } } as never

describe('WireProviders', () => {
  test('builds from singleton keys and the invocation wire, and earlier wire keys', async () => {
    const registry = new ProviderRegistry()
      .add(
        'scope',
        (({ logger: l }: any, w: any) => ({
          scope: { l, user: w.session.userId },
        })) as never,
        meta(['logger'], ['scope']),
        { kind: 'wire' }
      )
      .add(
        'events',
        (({ scope }: any) => ({ events: scope.user })) as never,
        meta(['scope'], ['events']),
        { kind: 'wire' }
      )
    const run = await new WireProviders(registry, { target: 'dev' }).run(
      { logger },
      wire
    )
    assert.deepEqual(Object.keys(run.services), ['scope', 'events'])
    assert.equal(run.services.events, 'u1')
  })

  test('a provider reading an undeclared key is undeclared-read', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      ((services: any) => ({ a: services.secrets })) as never,
      meta([], ['a']),
      { kind: 'wire' }
    )
    await assert.rejects(
      new WireProviders(registry, { target: 'dev' }).run(
        { logger, secrets: 's' },
        wire
      ),
      (error: ProviderError) => error.kind === 'undeclared-read'
    )
  })

  test('keys the runner holds are visible only to a provider that declares them', async () => {
    const registry = new ProviderRegistry().add(
      'events',
      (({ auditLog }: any) => ({ events: auditLog?.id ?? 'none' })) as never,
      meta(['auditLog'], ['events'], { optional: ['auditLog'] }),
      { kind: 'wire' }
    )
    const wireProviders = new WireProviders(registry, { target: 'dev' })
    assert.equal(
      (
        await wireProviders.run({ logger }, wire, {
          held: { auditLog: { id: 'core' } },
        })
      ).services.events,
      'core'
    )
    assert.equal(
      (await wireProviders.run({ logger }, wire)).services.events,
      'none'
    )
  })

  test('a conditional provide leaves the key absent', async () => {
    const registry = new ProviderRegistry()
      .add(
        'audited',
        (({ audit }: any) => (audit ? { auditLog: { n: 1 } } : {})) as never,
        meta(['audit'], ['auditLog'], {
          optional: ['audit'],
          optionalProvides: ['auditLog'],
        }),
        { kind: 'wire' }
      )
      .add(
        'events',
        (({ auditLog }: any) => ({ events: auditLog !== undefined })) as never,
        meta(['auditLog'], ['events'], { optional: ['auditLog'] }),
        { kind: 'wire' }
      )
    const wireProviders = new WireProviders(registry, { target: 'dev' })
    const withAudit = await wireProviders.run({ logger, audit: {} }, wire)
    assert.equal(withAudit.services.events, true)
    const without = await wireProviders.run({ logger }, wire)
    assert.equal('auditLog' in without.services, false)
    assert.equal(without.services.events, false)
  })

  test('only the providers a function reaches are built, with what they need', async () => {
    const built: string[] = []
    const make = (name: string, key: string) =>
      (() => {
        built.push(name)
        return { [key]: name }
      }) as never
    const registry = new ProviderRegistry()
      .add('base', make('base', 'base'), meta([], ['base']), { kind: 'wire' })
      .add('top', make('top', 'top'), meta(['base'], ['top']), {
        kind: 'wire',
      })
      .add('other', make('other', 'other'), meta([], ['other']), {
        kind: 'wire',
      })
    const wireProviders = new WireProviders(registry, { target: 'dev' })
    const run = await wireProviders.run({ logger }, wire, { needs: ['top'] })
    assert.deepEqual(built, ['base', 'top'])
    assert.deepEqual(Object.keys(run.services), ['base', 'top'])
    built.length = 0
    await wireProviders.run({ logger }, wire, { needs: ['logger'] })
    assert.deepEqual(built, [])
  })

  test('stop runs latest provider first, once per object, and survives a failing stop', async () => {
    const order: string[] = []
    const shared = { stop: () => order.push('shared') }
    const registry = new ProviderRegistry()
      .add(
        'a',
        (() => ({ a: { stop: () => order.push('a') } })) as never,
        meta([], ['a']),
        { kind: 'wire' }
      )
      .add(
        'b',
        (() => ({
          b: {
            stop: () => {
              order.push('b')
              throw new Error('boom')
            },
          },
        })) as never,
        meta(['a'], ['b']),
        { kind: 'wire' }
      )
      .add(
        'c',
        (() => ({ c1: shared, c2: shared })) as never,
        meta(['b'], ['c1', 'c2']),
        { kind: 'wire' }
      )
    const errors: unknown[] = []
    const run = await new WireProviders(registry, { target: 'dev' }).run(
      { logger: { error: (e: unknown) => errors.push(e) } },
      wire
    )
    await run.stop()
    assert.deepEqual(order, ['shared', 'b', 'a'])
    assert.equal(errors.length, 1)
  })

  test('a provider that throws stops the ones already built', async () => {
    const stopped: string[] = []
    const registry = new ProviderRegistry()
      .add(
        'a',
        (() => ({ a: { stop: () => stopped.push('a') } })) as never,
        meta([], ['a']),
        { kind: 'wire' }
      )
      .add(
        'b',
        (() => {
          throw new Error('nope')
        }) as never,
        meta(['a'], ['b']),
        { kind: 'wire' }
      )
    await assert.rejects(
      new WireProviders(registry, { target: 'dev' }).run({ logger }, wire),
      (error: ProviderError) =>
        error.kind === 'factory-failed' &&
        error.message === "Provider 'b' failed to build: nope"
    )
    assert.deepEqual(stopped, ['a'])
  })

  test('two concurrent runs hold distinct instances', async () => {
    const registry = new ProviderRegistry().add(
      'scope',
      (async (_s: any, w: any) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { scope: { user: w.user } }
      }) as never,
      meta([], ['scope']),
      { kind: 'wire' }
    )
    const wireProviders = new WireProviders(registry, { target: 'dev' })
    const [one, two] = await Promise.all([
      wireProviders.run({ logger }, { user: 'one' } as never),
      wireProviders.run({ logger }, { user: 'two' } as never),
    ])
    assert.notEqual(one.services.scope, two.services.scope)
    assert.equal((one.services.scope as any).user, 'one')
    assert.equal((two.services.scope as any).user, 'two')
  })

  test('a provider reads wire.rpc lazily', async () => {
    let reads = 0
    const lateWire = {
      get rpc() {
        reads++
        return 'rpc'
      },
    } as never
    const registry = new ProviderRegistry().add(
      'lazy',
      ((_s: any, w: any) => ({ lazy: () => w.rpc })) as never,
      meta([], ['lazy']),
      { kind: 'wire' }
    )
    const run = await new WireProviders(registry, { target: 'dev' }).run(
      { logger },
      lateWire
    )
    assert.equal(reads, 0)
    assert.equal((run.services.lazy as () => string)(), 'rpc')
  })
})
