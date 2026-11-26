import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  PLATFORM_SERVICES_FILE,
  genericServerEntrySupport,
  writeUnitPlatformServices,
} from './platform-services.js'

type Variants = Record<string, { needs: string[]; provides: string[] }>

describe('writeUnitPlatformServices', () => {
  let root: string
  let unitDir: string

  beforeEach(() => {
    const base = join(import.meta.dir, '..', '..', '.tmp')
    mkdirSync(base, { recursive: true })
    root = mkdtempSync(join(base, 'unit-platform-'))
    unitDir = join(root, 'unit')
    mkdirSync(unitDir, { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const state = (
    services: Record<
      string,
      { variants: Variants; onServerStart?: boolean; file?: string }
    >
  ) =>
    ({
      pikkuServices: Object.fromEntries(
        Object.entries(services).map(([name, service]) => [
          name,
          {
            module: join(root, service.file ?? 'src/services.ts'),
            export: name,
            variants: service.variants,
            ...(service.onServerStart ? { onServerStart: true } : {}),
          },
        ])
      ),
      optedInServices: {},
      rpc: { wireAddonDeclarations: new Map() },
    }) as never

  const provider = (
    options: { baseline?: string[]; runsServerLifecycle?: boolean } | false = {}
  ) =>
    ({
      name: 'fake',
      ...(options === false
        ? {}
        : {
            serviceSupport: () => ({
              baseline: options.baseline ?? ['logger'],
              runsServerLifecycle: options.runsServerLifecycle ?? true,
            }),
          }),
    }) as never

  const run = (
    name: string,
    st: never,
    p = provider(),
    extra: Partial<Parameters<typeof writeUnitPlatformServices>[0]> = {}
  ) =>
    writeUnitPlatformServices({
      provider: p,
      ctx: { unit: { name }, unitDir } as never,
      state: st,
      projectDir: root,
      requiredServices: new Set(
        Object.values(
          (st as { pikkuServices: Record<string, { variants: Variants }> })
            .pikkuServices
        ).flatMap((meta) =>
          Object.values(meta.variants).flatMap((variant) => variant!.provides)
        )
      ),
      ...extra,
    })

  const file = () => readFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'utf8')

  test('writes a runner for the deploy variant and imports only that module', async () => {
    const result = await run(
      'api',
      state({
        mailer: {
          variants: {
            dev: { needs: [], provides: ['mailer'] },
            deploy: { needs: ['logger'], provides: ['mailer'] },
          },
        },
      })
    )
    assert.equal(result?.importPath, './platform-services.gen.js')
    const source = file()
    assert.match(source, /target: "deploy"/)
    assert.match(
      source,
      /registry\.add\("mailer", service0, \{"deploy":\{"needs":\["logger"\],"provides":\["mailer"\]\}\}\)/
    )
  })

  test('the unit coercion map wraps the service providing kysely', async () => {
    await run(
      'api',
      state({
        db: {
          variants: { deploy: { needs: [], provides: ['kysely'] } },
        },
      }),
      provider(),
      {
        ctx: {
          unit: { name: 'api' },
          unitDir,
          coercionMap: { users: { created_at: 'date' } },
        } as never,
      }
    )
    assert.match(file(), /registry\.add\("db", withKyselyCoercion\(service0\)/)
  })

  test('a service with only a dev variant on a deploy provider that does not hold its keys fails', async () => {
    await assert.rejects(
      run(
        'api',
        state({
          mailer: { variants: { dev: { needs: [], provides: ['mailer'] } } },
        })
      ),
      /no deploy variant and no common variant.*'mailer'/s
    )
  })

  test('a need the provider baseline does not hold is a build error naming it', async () => {
    await assert.rejects(
      run(
        'api',
        state({
          mailer: {
            variants: { common: { needs: ['kysely'], provides: ['mailer'] } },
          },
        })
      ),
      /'mailer' needs 'kysely' on deploy/
    )
  })

  test('the same service builds where the provider holds the key', async () => {
    const result = await run(
      'api',
      state({
        mailer: {
          variants: { common: { needs: ['kysely'], provides: ['mailer'] } },
        },
      }),
      provider({ baseline: ['kysely'] })
    )
    assert.ok(result)
  })

  test('a provider that cannot run services refuses a project that declares one', async () => {
    await assert.rejects(
      run(
        'api',
        state({
          mailer: { variants: { common: { needs: [], provides: ['mailer'] } } },
        }),
        provider(false)
      ),
      /fake deploy cannot run the services/
    )
  })

  test('nothing declared writes nothing and removes a stale file', async () => {
    writeFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'stale')
    const none = {
      pikkuServices: {},
      optedInServices: {},
      rpc: { wireAddonDeclarations: new Map() },
    } as never
    assert.equal(await run('api', none), undefined)
    assert.equal(existsSync(join(unitDir, PLATFORM_SERVICES_FILE)), false)
  })

  describe('server lifecycle hooks', () => {
    const starts = () =>
      state({
        queue: {
          variants: { common: { needs: [], provides: ['queue'] } },
          onServerStart: true,
        },
      })

    test('onServerStart where the target runs no server lifecycle is a build error naming service and unit', async () => {
      await assert.rejects(
        run('worker-unit', starts(), provider({ runsServerLifecycle: false })),
        /onServerStart would never be called: service 'queue' in unit 'worker-unit'/
      )
    })

    test('the same service builds where the target runs the server lifecycle', async () => {
      assert.ok(await run('container', starts()))
      assert.match(
        file(),
        /serverStartHooks: ServerHook\[\] = \[\n.*name: "queue"/
      )
    })

    test('the generic server entry supports services and runs the lifecycle', async () => {
      const result = await run(
        'container',
        starts(),
        { name: 'fake' } as never,
        {
          genericServerEntry: true,
        }
      )
      assert.ok(result)
      assert.deepEqual(genericServerEntrySupport(), {
        baseline: [],
        runsServerLifecycle: true,
      })
    })

    test('the generic server entry with nothing declared writes no file', async () => {
      const none = {
        pikkuServices: {},
        optedInServices: {},
        rpc: { wireAddonDeclarations: new Map() },
      } as never
      assert.equal(
        await run('c', none, { name: 'fake' } as never, {
          genericServerEntry: true,
        }),
        undefined
      )
    })
  })

  const withHost = (module: string, base = provider()) =>
    ({
      ...(base as object),
      platformServicesModule: () => module,
    }) as never

  test("a provider's platform services module is written in with no declared services", async () => {
    const result = await run('api', state({}), withHost('@acme/host'), {
      requiredServices: new Set(['queueService']),
    })
    assert.equal(result?.importPath, './platform-services.gen.js')
    assert.match(
      file(),
      /import \{ createPlatformServices as createHostPlatformServices \} from "@acme\/host"/
    )
    assert.match(file(), /requiredServices: \["queueService"\]/)
  })

  test('what the project factory reads counts as required', async () => {
    await run(
      'api',
      { ...(state({}) as object), projectServicesRead: ['kysely'] } as never,
      withHost('@acme/host')
    )
    assert.match(file(), /requiredServices: \["kysely"\]/)
  })

  test('a module on a provider that builds no platform services fails the build', async () => {
    await assert.rejects(
      run('api', state({}), withHost('@acme/host', provider(false))),
      /platform services module/
    )
  })
})
