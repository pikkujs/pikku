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
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PLATFORM_SERVICES_FILE,
  genericServerEntrySupport,
  writeUnitPlatformServices,
} from './platform-services.js'

const basePlatform = {
  serviceNames: [],
  needsQueue: false,
  needsWorkflow: false,
  needsAgent: false,
}

describe('writeUnitPlatformServices', () => {
  let root: string
  let unitDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-unit-platform-'))
    unitDir = join(root, 'unit')
    mkdirSync(unitDir, { recursive: true })
    mkdirSync(join(root, 'node_modules', 'addon', 'src'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'addon', 'package.json'), '{}')
    writeFileSync(
      join(root, 'node_modules', 'addon', 'src', 'only-api.ts'),
      `export const onlyApi = { provides: ['marker'], when: (p: any) => p.unit.name === 'api', run(s: any) { s.marker = 1 } }\n`
    )
    writeFileSync(
      join(root, 'node_modules', 'addon', 'src', 'bindings.ts'),
      `export const bindings = { provides: ['b'], requires: ['cloudflare'], run() {} }\n`
    )
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const state = (name: string, file: string, exportName: string) =>
    ({
      optedInContributors: {
        ns: {
          packageName: 'addon',
          contributors: {
            [name]: { deploy: { module: file, export: exportName } },
          },
        },
      },
      rpc: {
        wireAddonDeclarations: new Map([
          ['ns', { file: join(root, 'src/a.ts') }],
        ]),
      },
    }) as never

  const provider = (
    supported: string[],
    withSupport = true,
    runsServerLifecycle = true
  ) =>
    ({
      name: 'fake',
      ...(withSupport
        ? {
            contributorSupport: (ctx: any) => ({
              supported,
              runsServerLifecycle,
              runtimeServices: ['logger'],
              widenPlatform: (p: any) => ({ ...p, unit: ctx.unit }),
            }),
          }
        : {}),
    }) as never

  const ctx = (name: string) =>
    ({
      unit: { name },
      unitDir,
      contributorPlatform: basePlatform,
    }) as never

  const run = (
    name: string,
    st: never,
    p = provider(['env']),
    extra: Partial<Parameters<typeof writeUnitPlatformServices>[0]> = {}
  ) =>
    writeUnitPlatformServices({
      provider: p,
      ctx: ctx(name),
      state: st,
      projectDir: root,
      ...extra,
    })

  test('the widened unit reaches when: the contributor is bundled only into its unit', async () => {
    const st = state('onlyApi', 'src/only-api.ts', 'onlyApi')
    const api = await run('api', st)
    assert.equal(api?.importPath, './platform-services.gen.js')
    assert.match(
      readFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'utf8'),
      /only-api/
    )
    assert.equal(await run('worker', st), undefined)
    assert.equal(existsSync(join(unitDir, PLATFORM_SERVICES_FILE)), false)
  })

  test('a contributor requiring a binding the provider lacks is a build error naming it', async () => {
    await assert.rejects(
      run('api', state('bindings', 'src/bindings.ts', 'bindings')),
      /fake deploy.*'bindings' of addon 'ns' \(addon\) requires cloudflare/s
    )
  })

  test('the same contributor builds where the provider supplies the binding', async () => {
    const result = await run(
      'api',
      state('bindings', 'src/bindings.ts', 'bindings'),
      provider(['env', 'cloudflare'])
    )
    assert.ok(result)
  })

  test('a provider that cannot run contributors refuses a project that opted in', async () => {
    await assert.rejects(
      run(
        'api',
        state('onlyApi', 'src/only-api.ts', 'onlyApi'),
        provider([], false)
      ),
      /fake deploy cannot run the contributors/
    )
  })

  test('nothing opted in writes nothing and removes a stale file', async () => {
    writeFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'stale')
    const none = {
      optedInContributors: {},
      rpc: { wireAddonDeclarations: new Map() },
    } as never
    assert.equal(await run('api', none), undefined)
    assert.equal(existsSync(join(unitDir, PLATFORM_SERVICES_FILE)), false)
  })

  describe('server lifecycle hooks', () => {
    beforeEach(() => {
      writeFileSync(
        join(root, 'node_modules', 'addon', 'src', 'hooks.ts'),
        `export const starts = { provides: ['q'], run(s: any) { s.q = 1 }, onServerStart() {} }\n` +
          `export const stops = { provides: ['q'], run(s: any) { s.q = 1 }, onServerStop() {} }\n`
      )
    })

    test('onServerStart where the target runs no server lifecycle is a build error naming contributor and unit', async () => {
      await assert.rejects(
        run(
          'worker-unit',
          state('starts', 'src/hooks.ts', 'starts'),
          provider(['env'], true, false)
        ),
        /'starts'.*unit 'worker-unit'|unit 'worker-unit'.*'starts'/s
      )
      await assert.rejects(
        run(
          'worker-unit',
          state('starts', 'src/hooks.ts', 'starts'),
          provider(['env'], true, false)
        ),
        /onServerStart would never be called/
      )
    })

    test('the same contributor builds where the target runs the server lifecycle', async () => {
      const result = await run(
        'container',
        state('starts', 'src/hooks.ts', 'starts')
      )
      assert.ok(result)
      assert.match(
        readFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'utf8'),
        /serverStartHooks: ServerHook\[\] = \[\n.*name: "starts"/
      )
    })

    test('onServerStop where the target runs no server lifecycle only warns', async () => {
      const warnings: string[] = []
      const result = await run(
        'worker-unit',
        state('stops', 'src/hooks.ts', 'stops'),
        provider(['env'], true, false),
        { warn: (message) => warnings.push(message) }
      )
      assert.ok(result)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0]!, /'stops'.*onServerStop.*'worker-unit'/)
    })

    test('a provider that does not say it runs the server lifecycle is treated as not running it', async () => {
      const p = {
        name: 'fake',
        contributorSupport: () => ({
          supported: ['env'],
          runtimeServices: ['logger'],
        }),
      } as never
      await assert.rejects(
        run('u', state('starts', 'src/hooks.ts', 'starts'), p),
        /onServerStart would never be called/
      )
    })

    test('the generic server entry supports platform services and runs the lifecycle', async () => {
      const result = await run(
        'container',
        state('starts', 'src/hooks.ts', 'starts'),
        { name: 'fake' } as never,
        { genericServerEntry: true }
      )
      assert.ok(result)
      assert.deepEqual(genericServerEntrySupport(ctx('x')).runtimeServices, [])
    })

    test('the generic server entry with nothing opted in writes no file', async () => {
      const none = {
        optedInContributors: {},
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
})
