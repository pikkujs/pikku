import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectServiceSources,
  providedKeys,
  resolveAllTargets,
  resolvePikkuServices,
} from './resolve-pikku-services.js'

const scratchRoot = () => {
  const dir = join(import.meta.dir, '../..', '.tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

type Variant = {
  needs: string[]
  provides: string[]
  module?: string
  export?: string
}

describe('resolvePikkuServices', () => {
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
      pikkuServices: services,
      optedInServices: optedIn,
      rpc: {
        wireAddonDeclarations: new Map([
          ['ns', { file: join(root, 'src/a.ts') }],
        ]),
      },
    }) as never

  const allProvided = (st: never): string[] => {
    const { pikkuServices, optedInServices } = st as unknown as {
      pikkuServices: Record<string, { variants: Record<string, Variant> }>
      optedInServices: Record<
        string,
        { services: Record<string, { variants: Record<string, Variant> }> }
      >
    }
    return [
      ...Object.values(pikkuServices),
      ...Object.values(optedInServices).flatMap((opted) =>
        Object.values(opted.services)
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
    resolvePikkuServices({
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
      /both provide 'logger'/
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
      /'a' needs 'kysely' on dev.*baseline only has: logger/s
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
        /no dev variant and no common variant.*'queueService'/s
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
        /no dev variant/
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
            targetLabel: 'The cloudflare deploy',
          }),
        /The cloudflare deploy does not run the server lifecycle.*service 'q' in unit 'api'/s
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
      return state({}, { ns: { packageName: 'addon', services } })
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
        { ns: { packageName: 'missing-addon', services: { inbox } } }
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
        { ns: { packageName: 'addon', services: { inbox } } }
      )
      assert.equal(
        collectServiceSources(st, root)[0]!.module,
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
        /does not run the server lifecycle.*service 'q'/s
      )
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
