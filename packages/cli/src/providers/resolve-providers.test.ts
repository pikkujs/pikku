import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectProviderSources,
  providedKeys,
  resolveAllTargets,
  resolveProviders,
} from './resolve-providers.js'

const scratchRoot = () => {
  const dir = join(import.meta.dir, '../..', '.tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

type Variant = {
  needs: string[]
  optional?: string[]
  provides: string[]
  optionalProvides?: string[]
  module?: string
  export?: string
}

describe('resolveProviders', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(scratchRoot(), 'pikku-resolve-services-'))
    mkdirSync(join(root, 'src'), { recursive: true })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const service = (
    variants: Record<string, Variant>,
    extra: { onServerStart?: boolean; module?: string } = {}
  ) => ({
    module: join(root, extra.module ?? 'src/services.ts'),
    export: 'svc',
    variants,
    ...(extra.onServerStart ? { onServerStart: true } : {}),
  })

  const state = (
    services: Record<string, ReturnType<typeof service>>,
    optedIn: Record<string, unknown> = {}
  ) =>
    ({
      providers: services,
      optedInProviders: optedIn,
      rpc: {
        wireAddonDeclarations: new Map([
          ['ns', { file: join(root, 'src/a.ts') }],
        ]),
      },
    }) as never

  const allProvided = (st: never): string[] => {
    const { providers, optedInProviders } = st as unknown as {
      providers: Record<string, { variants: Record<string, Variant> }>
      optedInProviders: Record<
        string,
        { providers: Record<string, { variants: Record<string, Variant> }> }
      >
    }
    return [
      ...Object.values(providers),
      ...Object.values(optedInProviders).flatMap((opted) =>
        Object.values(opted.providers)
      ),
    ].flatMap((meta) =>
      Object.values(meta.variants).flatMap((variant) => variant.provides)
    )
  }

  const resolve = (
    st: never,
    target: 'dev' | 'deploy' = 'dev',
    baseline: string[] = ['logger'],
    extra: Record<string, unknown> = {}
  ) =>
    resolveProviders({
      state: st,
      rootDir: root,
      target,
      baseline,
      requiredServices: allProvided(st),
      ...extra,
    })

  test('orders a service after the services it needs', () => {
    const { ordered } = resolve(
      state({
        inbox: service({ common: { needs: ['mailer'], provides: ['inbox'] } }),
        mailer: service({
          common: { needs: ['logger'], provides: ['mailer'] },
        }),
      })
    )
    assert.deepEqual(
      ordered.map((s) => s.name),
      ['mailer', 'inbox']
    )
  })

  test("a target's own variant overrides common", () => {
    const st = state({
      clock: service({
        common: { needs: [], provides: ['clock'] },
        dev: { needs: ['logger'], provides: ['clock'] },
      }),
    })
    const dev = resolve(st, 'dev').ordered[0]!
    assert.equal(dev.variant, 'dev')
    assert.deepEqual(dev.needs, ['logger'])
    assert.equal(resolve(st, 'deploy').ordered[0]!.variant, 'common')
  })

  test('two services providing one key is an error naming both', () => {
    assert.throws(
      () =>
        resolve(
          state({
            a: service({ common: { needs: [], provides: ['kv'] } }),
            b: service({ common: { needs: [], provides: ['kv'] } }),
          })
        ),
      /'a' and 'b' both provide 'kv'/
    )
  })

  test('a baseline key may be replaced by exactly one service', () => {
    const one = state({
      kv: service({ common: { needs: [], provides: ['logger'] } }),
    })
    assert.equal(resolve(one).ordered.length, 1)
    assert.throws(
      () =>
        resolve(
          state({
            a: service({ common: { needs: [], provides: ['logger'] } }),
            b: service({ common: { needs: [], provides: ['logger'] } }),
          })
        ),
      /\[PKU385\].*both provide 'logger'/
    )
  })

  test('a need nothing meets is an error naming the baseline', () => {
    assert.throws(
      () =>
        resolve(
          state({
            a: service({ common: { needs: ['kysely'], provides: ['a'] } }),
          })
        ),
      /\[PKU386\].*'a' needs 'kysely' on the dev target.*baseline only has: logger.*List it in optional/s
    )
  })

  test('a cycle is an error', () => {
    assert.throws(
      () =>
        resolve(
          state({
            a: service({ common: { needs: ['b'], provides: ['a'] } }),
            b: service({ common: { needs: ['a'], provides: ['b'] } }),
          })
        ),
      /cycle/
    )
  })

  describe('every target is covered', () => {
    const deployOnlyServices = () =>
      state({
        queue: service({ deploy: { needs: [], provides: ['queueService'] } }),
      })

    test('a service with no variant for the target is an error', () => {
      assert.throws(
        () => resolve(deployOnlyServices(), 'dev'),
        /\[PKU388\].*no variant for the dev target \(looked for dev, common\).*'queueService'/s
      )
    })

    test('unless the baseline already holds what it provides', () => {
      const deployOnly = deployOnlyServices()
      const { ordered } = resolve(deployOnly, 'dev', ['logger', 'queueService'])
      assert.deepEqual(ordered, [])
      assert.equal(resolve(deployOnly, 'deploy').ordered.length, 1)
    })

    test('resolveAllTargets checks each target against its own baseline', () => {
      assert.throws(
        () =>
          resolveAllTargets({
            state: deployOnlyServices(),
            rootDir: root,
            requiredServices: ['queueService'],
            baseline: { dev: ['logger'], deploy: ['logger'] },
          }),
        /no variant for the dev target/
      )
      const both = resolveAllTargets({
        state: deployOnlyServices(),
        rootDir: root,
        requiredServices: ['queueService'],
        baseline: { dev: ['queueService'], deploy: [] },
      })
      assert.equal(both.dev.ordered.length, 0)
      assert.equal(both.deploy.ordered.length, 1)
    })
  })

  describe('runsServerLifecycle', () => {
    const startingServices = () =>
      state({
        q: service(
          { common: { needs: [], provides: ['q'] } },
          { onServerStart: true }
        ),
      })

    test('onServerStart on a target that runs no lifecycle is an error naming service and unit', () => {
      assert.throws(
        () =>
          resolve(startingServices(), 'deploy', [], {
            runsServerLifecycle: false,
            unitLabel: "unit 'api'",
            targetLabel: 'the cloudflare deploy',
          }),
        /\[PKU389\].*The cloudflare deploy does not run the server lifecycle.*provider 'q' in unit 'api'/s
      )
    })

    test('and carries through where the lifecycle runs', () => {
      assert.equal(resolve(startingServices()).ordered[0]!.onServerStart, true)
    })
  })

  test('a variant in a module of its own is carried as a ref', () => {
    const st = state({
      mailer: service({
        dev: {
          needs: [],
          provides: ['mailer'],
          module: join(root, 'src/mailer.dev.ts'),
          export: 'mailerDev',
        },
        deploy: { needs: [], provides: ['mailer'] },
      }),
    })
    assert.deepEqual(resolve(st, 'dev').ordered[0]!.variantRef, {
      module: join(root, 'src/mailer.dev.ts'),
      export: 'mailerDev',
    })
    assert.equal(resolve(st, 'deploy').ordered[0]!.variantRef, undefined)
  })

  describe('opted-in addon services', () => {
    const addon = (services: Record<string, unknown>) => {
      const dir = join(root, 'node_modules/addon')
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'package.json'), '{}')
      writeFileSync(join(dir, 'src/inbox.ts'), 'export const inbox = 1\n')
      return state({}, { ns: { packageName: 'addon', providers: services } })
    }
    const inbox = {
      module: 'src/inbox.ts',
      export: 'inbox',
      variants: { common: { needs: ['logger'], provides: ['inbox'] } },
    }

    test('are located in the installed package and named by namespace', () => {
      const { ordered } = resolve(addon({ inbox }))
      assert.equal(ordered[0]!.name, 'ns/inbox')
      assert.equal(
        ordered[0]!.module,
        join(root, 'node_modules/addon/src/inbox.ts')
      )
    })

    test('an addon that is not installed is an error naming it', () => {
      const st = state(
        {},
        { ns: { packageName: 'missing-addon', providers: { inbox } } }
      )
      assert.throws(() => resolve(st), /missing-addon is not installed/)
    })

    test('a published addon is found under dist as js', () => {
      const dir = join(root, 'node_modules/addon')
      mkdirSync(join(dir, 'dist/src'), { recursive: true })
      writeFileSync(join(dir, 'package.json'), '{}')
      writeFileSync(join(dir, 'dist/src/inbox.js'), 'export const inbox = 1\n')
      const st = state(
        {},
        { ns: { packageName: 'addon', providers: { inbox } } }
      )
      assert.equal(
        collectProviderSources(st, root)[0]!.module,
        join(dir, 'dist/src/inbox.js')
      )
    })
  })

  describe('reachability', () => {
    const by = (required: string[], factoryServices: string[] = []) => ({
      requiredServices: required,
      factoryServices,
    })

    test('a service nothing reaches is dropped, with no variant check', () => {
      const st = state({
        used: service({ common: { needs: [], provides: ['used'] } }),
        // no dev variant and no common: would be an error if it were selected
        idle: service({ deploy: { needs: [], provides: ['idle'] } }),
      })
      const { ordered } = resolve(st, 'dev', ['logger'], by(['used']))
      assert.deepEqual(
        ordered.map((s) => s.name),
        ['used']
      )
    })

    test('a service a selected service needs is pulled in transitively', () => {
      const st = state({
        inbox: service({ common: { needs: ['mailer'], provides: ['inbox'] } }),
        mailer: service({ common: { needs: ['smtp'], provides: ['mailer'] } }),
        smtp: service({ common: { needs: [], provides: ['smtp'] } }),
        other: service({ common: { needs: [], provides: ['other'] } }),
      })
      const { ordered } = resolve(st, 'dev', ['logger'], by(['inbox']))
      assert.deepEqual(
        ordered.map((s) => s.name),
        ['smtp', 'mailer', 'inbox']
      )
    })

    test('what the project factory reads seeds the set too', () => {
      const st = state({
        nats: service({ common: { needs: [], provides: ['nats'] } }),
      })
      assert.equal(resolve(st, 'dev', ['logger'], by([])).ordered.length, 0)
      assert.equal(
        resolve(st, 'dev', ['logger'], by([], ['nats'])).ordered.length,
        1
      )
    })

    test('a service replacing a baseline key is selected when that key is reached', () => {
      const st = state({
        kv: service({ common: { needs: [], provides: ['logger'] } }),
      })
      assert.equal(resolve(st, 'dev', ['logger'], by([])).ordered.length, 0)
      assert.equal(
        resolve(st, 'dev', ['logger'], by(['logger'])).ordered.length,
        1
      )
    })

    test('one key with two providers fails even when nothing reaches it', () => {
      const st = state({
        a: service({ common: { needs: [], provides: ['kv'] } }),
        b: service({ common: { needs: [], provides: ['kv'] } }),
      })
      assert.throws(
        () => resolve(st, 'dev', ['logger'], by([])),
        /'a' and 'b' both provide 'kv'/
      )
    })

    test('an unreached onServerStart service does not break a target without the lifecycle', () => {
      const st = state({
        q: service(
          { common: { needs: [], provides: ['q'] } },
          { onServerStart: true }
        ),
      })
      const worker = { runsServerLifecycle: false, unitLabel: "unit 'api'" }
      assert.deepEqual(
        resolve(st, 'deploy', [], { ...by([]), ...worker }).ordered,
        []
      )
      assert.throws(
        () => resolve(st, 'deploy', [], { ...by(['q']), ...worker }),
        /does not run the server lifecycle.*provider 'q'/s
      )
    })
  })

  describe('profiles', () => {
    const db = () =>
      state({
        db: service({
          'deploy:cloudflare-worker': { needs: [], provides: ['kysely'] },
          deploy: { needs: ['logger'], provides: ['kysely'] },
        }),
      })

    test('a deploy:<profile> variant beats deploy for that profile only', () => {
      const worker = resolve(db(), 'deploy', ['logger'], {
        profile: 'cloudflare-worker',
      }).ordered[0]!
      const standalone = resolve(db(), 'deploy', ['logger'], {
        profile: 'standalone',
      }).ordered[0]!
      assert.equal(worker.variant, 'deploy:cloudflare-worker')
      assert.equal(standalone.variant, 'deploy')
    })

    test('a provider with only another profile has no variant, naming what was looked for', () => {
      const only = state({
        db: service({
          'deploy:cloudflare-worker': { needs: [], provides: ['kysely'] },
        }),
      })
      assert.throws(
        () => resolve(only, 'deploy', ['logger'], { profile: 'standalone' }),
        /\[PKU388\].*looked for deploy:standalone, deploy, common/s
      )
    })

    test('a provider with no variant for a key the baseline holds is not run', () => {
      const only = state({
        db: service({
          'deploy:cloudflare-worker': { needs: [], provides: ['kysely'] },
        }),
      })
      const { ordered } = resolve(only, 'deploy', ['logger', 'kysely'], {
        profile: 'standalone',
      })
      assert.deepEqual(ordered, [])
    })
  })

  describe('entry-owned keys', () => {
    const plainDeploy = () =>
      state({
        db: service({ deploy: { needs: [], provides: ['kysely'] } }),
      })

    test('a deploy variant providing a key the entry opens is PKU397', () => {
      assert.throws(
        () =>
          resolve(plainDeploy(), 'deploy', ['logger', 'kysely'], {
            entryOwned: ['kysely'],
            targetLabel: 'the standalone deploy',
          }),
        /\[PKU397\] The standalone deploy opens its own 'kysely'; provider 'db' cannot replace it/
      )
    })

    test('the same provider is a replacement where the entry owns nothing', () => {
      const { ordered } = resolve(plainDeploy(), 'deploy', ['logger', 'kysely'])
      assert.equal(ordered[0]!.name, 'db')
    })
  })

  describe('optional needs and optional provides', () => {
    test('an optional need nothing provides is built without it', () => {
      const { ordered } = resolve(
        state({
          a: service({
            common: {
              needs: ['kysely'],
              optional: ['kysely'],
              provides: ['a'],
            },
          }),
        })
      )
      assert.deepEqual(
        ordered.map((s) => s.name),
        ['a']
      )
      assert.deepEqual(ordered[0]!.optional, ['kysely'])
    })

    test('an optional need a provider provides pulls that provider in, ahead of the needer', () => {
      const { ordered } = resolve(
        state({
          a: service({
            common: { needs: ['y'], optional: ['y'], provides: ['a'] },
          }),
          b: service({ common: { needs: [], provides: ['y'] } }),
        }),
        'dev',
        ['logger'],
        { requiredServices: ['a'] }
      )
      assert.deepEqual(
        ordered.map((s) => s.name),
        ['b', 'a']
      )
    })

    test('a need on a key provided only sometimes has to be listed in optional (PKU391)', () => {
      assert.throws(
        () =>
          resolve(
            state({
              maybe: service({
                common: {
                  needs: [],
                  provides: ['sometimes'],
                  optionalProvides: ['sometimes'],
                },
              }),
              consumer: service({
                common: { needs: ['sometimes'], provides: ['consumer'] },
              }),
            })
          ),
        /\[PKU391\] Provider 'consumer' needs 'sometimes', which 'maybe' provides only sometimes\. Add 'sometimes' to its optional list\./
      )
    })

    test('an optional chain a -> b -> c resolves in order', () => {
      const { ordered } = resolve(
        state({
          c: service({
            common: { needs: ['z'], optional: ['z'], provides: ['c'] },
          }),
          b: service({
            common: {
              needs: ['y'],
              optional: ['y'],
              provides: ['z'],
              optionalProvides: ['z'],
            },
          }),
          a: service({
            common: {
              needs: ['x'],
              optional: ['x'],
              provides: ['y'],
              optionalProvides: ['y'],
            },
          }),
        }),
        'dev',
        ['logger'],
        { requiredServices: ['c'] }
      )
      assert.deepEqual(
        ordered.map((s) => s.name),
        ['a', 'b', 'c']
      )
    })
  })

  describe('function needs', () => {
    const factoryState = (extra: Record<string, unknown> = {}) =>
      ({
        ...(state({
          probe: service({ common: { needs: [], provides: ['probe'] } }),
        }) as object),
        projectServicesProvided: { keys: ['logger', 'config'], optional: [] },
        projectWireServicesProvided: { keys: [], optional: [] },
        serviceTypes: { singletonOptional: ['jwt'] },
        ...extra,
      }) as never
    const needs = (name: string, ...keys: string[]) => ({ name, needs: keys })

    test('a key nothing provides is PKU390 naming the function and where', () => {
      assert.throws(
        () =>
          resolve(factoryState(), 'dev', ['logger'], {
            functions: [needs('useNeeds', 'ghost')],
            targetLabel: 'pikku dev',
          }),
        /\[PKU390\] Function 'useNeeds' needs 'ghost' in pikku dev, which nothing provides/
      )
    })

    test('a provider key, a baseline key, a factory key and a core per-request key all pass', () => {
      resolve(factoryState(), 'dev', ['logger', 'queueService'], {
        functions: [
          needs(
            'f',
            'probe',
            'queueService',
            'config',
            'auditLog',
            'analytics'
          ),
        ],
      })
    })

    test('a key that may be absent is not required', () => {
      resolve(factoryState(), 'dev', ['logger'], {
        functions: [needs('f', 'jwt')],
      })
      resolve(
        factoryState({
          projectServicesProvided: { keys: ['maybe'], optional: ['maybe'] },
        }),
        'dev',
        ['logger'],
        { functions: [needs('f', 'maybe')] }
      )
    })

    test('only the functions given are checked, so a unit lacking a function does not fail on it', () => {
      resolve(factoryState(), 'dev', ['logger'], {
        functions: [needs('inThisUnit', 'probe')],
      })
    })
  })

  test('providedKeys is the union over every variant', () => {
    assert.deepEqual(
      providedKeys(
        service({
          dev: { needs: [], provides: ['a'] },
          deploy: { needs: [], provides: ['a', 'b'] },
        }) as never
      ).sort(),
      ['a', 'b']
    )
  })
})
