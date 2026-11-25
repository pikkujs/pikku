import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveProviders } from './resolve-providers.js'

type Variants = Record<
  string,
  {
    needs: string[]
    optional?: string[]
    provides: string[]
    optionalProvides?: string[]
  }
>

type Provider = {
  variants: Variants
  onServerStart?: boolean
  kind?: 'wire'
  replaces?: string[]
}

const state = (
  providers: Record<string, Provider>,
  extra: Record<string, unknown> = {}
) =>
  ({
    providers: Object.fromEntries(
      Object.entries(providers).map(([name, provider]) => [
        name,
        { module: '/p/src/p.ts', export: name, ...provider },
      ])
    ),
    optedInProviders: {},
    rpc: { wireAddonDeclarations: new Map() },
    ...extra,
  }) as never

const message = (
  providers: Record<string, Provider>,
  options: Partial<Parameters<typeof resolveProviders>[0]> = {},
  extra: Record<string, unknown> = {}
): string => {
  const wanted = Object.values(providers).flatMap((provider) =>
    Object.values(provider.variants).flatMap((variant) => variant.provides)
  )
  try {
    resolveProviders({
      state: state(providers, extra),
      rootDir: '/p',
      target: 'deploy',
      profile: 'standalone',
      baseline: ['logger'],
      requiredServices: wanted,
      targetLabel: 'the standalone deploy',
      ...options,
    })
  } catch (error) {
    return (error as Error).message
  }
  assert.fail('expected the build to fail')
}

const common = (
  needs: string[],
  provides: string[],
  extra: { optional?: string[]; optionalProvides?: string[] } = {}
): { variants: Variants } => ({
  variants: { common: { needs, provides, ...extra } },
})

const wire = (
  needs: string[],
  provides: string[],
  extra: { optional?: string[]; optionalProvides?: string[] } = {}
): Provider => ({ ...common(needs, provides, extra), kind: 'wire' })

describe('provider build errors, one exact message per code', () => {
  test('PKU385 PROVIDER_KEY_DUPLICATED', () => {
    assert.equal(
      message({ a: common([], ['kv']), b: common([], ['kv']) }),
      "[PKU385] Providers 'a' and 'b' both provide 'kv' on the standalone deploy. Each key has one provider."
    )
  })

  test('PKU386 PROVIDER_NEED_UNMET', () => {
    assert.equal(
      message({ a: common(['kysely'], ['a']) }),
      "[PKU386] Provider 'a' needs 'kysely' on the standalone deploy, which nothing provides. No provider provides it, and the baseline only has: logger. List it in optional if the provider works without it."
    )
  })

  test('PKU387 PROVIDER_CYCLE', () => {
    assert.equal(
      message({ a: common(['b'], ['a']), b: common(['a'], ['b']) }),
      '[PKU387] Providers depend on each other in a cycle on the standalone deploy: a -> b -> a'
    )
  })

  test('PKU388 PROVIDER_NO_VARIANT', () => {
    assert.equal(
      message({ a: { variants: { dev: { needs: [], provides: ['a'] } } } }),
      "[PKU388] Provider 'a' has no variant for the standalone deploy (looked for deploy:standalone, deploy, common), so it would run without 'a'. Give it one of those, or have it provide only keys the standalone deploy already holds."
    )
  })

  test('PKU389 PROVIDER_START_UNSUPPORTED', () => {
    assert.equal(
      message(
        { q: { ...common([], ['q']), onServerStart: true } },
        { runsServerLifecycle: false, unitLabel: "unit 'api'" }
      ),
      "[PKU389] The standalone deploy does not run the server lifecycle, so onServerStart would never be called: provider 'q' in unit 'api'. Remove it from the project (or from wireAddon({ providers })), or deploy this unit as a server (container) target."
    )
  })

  test('PKU390 FUNCTION_NEED_UNMET', () => {
    assert.equal(
      message(
        { a: common([], ['a']) },
        {
          functions: [{ name: 'useNeeds', needs: ['ghost'] }],
        }
      ),
      "[PKU390] Function 'useNeeds' needs 'ghost' in the standalone deploy, which nothing provides: no provider, no baseline key, and the project's pikkuServices factory does not return it."
    )
  })

  test('PKU391 PROVIDER_NEEDS_OPTIONAL_KEY', () => {
    assert.equal(
      message({
        maybe: common([], ['sometimes'], { optionalProvides: ['sometimes'] }),
        consumer: common(['sometimes'], ['consumer']),
      }),
      "[PKU391] Provider 'consumer' needs 'sometimes', which 'maybe' provides only sometimes. Add 'sometimes' to its optional list."
    )
  })

  test('PKU392 SINGLETON_NEEDS_WIRE_KEY', () => {
    assert.equal(
      message({
        perRequest: wire([], ['requestScope']),
        bad: common(['requestScope'], ['bad']),
      }),
      "[PKU392] Provider 'bad' is a singleton but needs 'requestScope', which wire provider 'perRequest' builds per request. Make 'bad' a defineWireProvider, or stop needing 'requestScope'."
    )
  })

  test('PKU393 WIRE_KEY_SHADOWS_SINGLETON', () => {
    assert.equal(
      message({
        held: common([], ['held']),
        shadow: wire([], ['held']),
      }),
      "[PKU393] Wire provider 'shadow' provides 'held', which 'held' already holds as a singleton on the standalone deploy. A key has one lifetime."
    )
    assert.equal(
      message({ shadow: { ...wire([], ['logger']), replaces: ['logger'] } }),
      "[PKU393] Wire provider 'shadow' provides 'logger', which 'the baseline' already holds as a singleton on the standalone deploy. A key has one lifetime."
    )
    assert.equal(
      message(
        { held: common([], ['kysely']) },
        {},
        { projectWireServicesProvided: { keys: ['kysely'], optional: [] } }
      ),
      "[PKU393] Wire provider 'createWireServices' provides 'kysely', which 'held' already holds as a singleton on the standalone deploy. A key has one lifetime."
    )
  })

  test('PKU399 CORE_WIRE_KEY_PROVIDED', () => {
    assert.equal(
      message({ audit: wire([], ['auditLog']) }),
      "[PKU399] Wire provider 'audit' provides 'auditLog', which core builds for every invocation (auditLog, analytics, session, rpc)."
    )
  })

  test('a wire provider needing core auditLog must list it as optional (PKU391)', () => {
    assert.equal(
      message({ events: wire(['auditLog'], ['events']) }),
      "[PKU391] Provider 'events' needs 'auditLog', which 'core' provides only sometimes. Add 'auditLog' to its optional list."
    )
  })

  test('PKU394 PROTECTED_KEY_NOT_REPLACED', () => {
    assert.equal(
      message({ pino: common([], ['logger']) }),
      "[PKU394] Provider 'pino' provides 'logger', a protected key, without listing it in replaces. Add replaces: ['logger'] to its definition."
    )
  })

  test('a protected key listed in replaces is accepted', () => {
    assert.doesNotThrow(() =>
      resolveProviders({
        state: state({
          pino: { ...common([], ['logger']), replaces: ['logger'] },
        }),
        rootDir: '/p',
        target: 'deploy',
        profile: 'standalone',
        baseline: ['logger'],
        requiredServices: ['logger'],
        targetLabel: 'the standalone deploy',
      })
    )
  })

  test('PKU397 ENTRY_OWNED_KEY_REPLACED', () => {
    assert.equal(
      message(
        { db: common([], ['kysely']) },
        { baseline: ['logger', 'kysely'], entryOwned: ['kysely'] }
      ),
      "[PKU397] The standalone deploy opens its own 'kysely'; provider 'db' cannot replace it. Give 'db' no variant for this target (for a database addon: no deploy:standalone variant)."
    )
  })
})
