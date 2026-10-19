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

  const provider = (supported: string[], withSupport = true) =>
    ({
      name: 'fake',
      ...(withSupport
        ? {
            contributorSupport: (ctx: any) => ({
              supported,
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

  const run = (name: string, st: never, p = provider(['env'])) =>
    writeUnitPlatformServices({
      provider: p,
      ctx: ctx(name),
      state: st,
      projectDir: root,
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
})
