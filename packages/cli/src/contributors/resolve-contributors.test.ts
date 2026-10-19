import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ContributorDependencyError } from '@pikku/core/contributors'
import { resolveTargetContributors } from './resolve-contributors.js'

const platform = {
  serviceNames: [],
  needsQueue: false,
  needsWorkflow: false,
  needsAgent: false,
  runtimeServices: ['logger'],
}

describe('resolveTargetContributors', () => {
  let root: string
  const modules: Record<string, Record<string, any>> = {}

  const install = (pkg: string, files: string[]) => {
    for (const file of files) {
      const path = join(root, 'node_modules', pkg, file)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, '')
    }
    mkdirSync(join(root, 'node_modules', pkg), { recursive: true })
    writeFileSync(join(root, 'node_modules', pkg, 'package.json'), '{}')
  }
  const load = async (file: string) => {
    const key = Object.keys(modules).find((k) => file.endsWith(k))
    if (!key) throw new Error(`unexpected load ${file}`)
    return modules[key]!
  }
  const stateFor = (
    contributors: Record<
      string,
      Record<string, { module: string; export: string }>
    >,
    namespace = 'ns',
    packageName = 'addon'
  ) =>
    ({
      optedInContributors: { [namespace]: { packageName, contributors } },
      rpc: {
        wireAddonDeclarations: new Map([
          [namespace, { file: join(root, 'src/a.ts') }],
        ]),
      },
    }) as never
  const run = (
    state: never,
    target: 'dev' | 'deploy' = 'dev',
    p: any = platform
  ) =>
    resolveTargetContributors({
      state,
      rootDir: root,
      target,
      platform: p,
      load,
    })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-resolve-contrib-'))
    for (const key of Object.keys(modules)) delete modules[key]
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('picks the variant for the target and orders by needs', async () => {
    install('addon', ['src/a.ts', 'src/b.ts'])
    modules['src/a.ts'] = {
      aDev: { provides: ['a'], needs: ['b'], run() {} },
      aDeploy: { provides: ['a'], run() {} },
    }
    modules['src/b.ts'] = {
      bDev: { provides: ['b'], run() {}, onServerStart() {} },
    }
    const state = stateFor({
      a: {
        dev: { module: 'src/a.ts', export: 'aDev' },
        deploy: { module: 'src/a.ts', export: 'aDeploy' },
      },
      b: { dev: { module: 'src/b.ts', export: 'bDev' } },
    })
    const dev = await run(state)
    assert.deepEqual(
      dev.ordered.map((c) => c.name),
      ['b', 'a']
    )
    assert.deepEqual(dev.ordered[0]!.hooks, { start: true, stop: false })
    assert.ok(dev.ordered[0]!.module.endsWith('node_modules/addon/src/b.ts'))
    assert.equal(dev.ordered[1]!.export, 'aDev')

    const deploy = await run(state, 'deploy')
    assert.deepEqual(
      deploy.ordered.map((c) => c.name),
      ['a']
    )
    assert.equal(deploy.ordered[0]!.export, 'aDeploy')
    assert.deepEqual(deploy.withoutVariant, ['b'])
  })

  test('a published addon with only a build resolves its .ts to dist .js', async () => {
    install('addon', ['dist/src/a.js'])
    modules['dist/src/a.js'] = { aDev: { provides: ['a'], run() {} } }
    const { ordered } = await run(
      stateFor({ a: { dev: { module: 'src/a.ts', export: 'aDev' } } })
    )
    assert.ok(ordered[0]!.module.endsWith('addon/dist/src/a.js'))
  })

  test('a module that exists nowhere is an error naming both places', async () => {
    install('addon', [])
    await assert.rejects(
      run(stateFor({ a: { dev: { module: 'src/a.ts', export: 'aDev' } } })),
      /neither .*src\/a\.ts nor .*dist\/src\/a\.js exists/
    )
  })

  test('an addon that is not installed is an error', async () => {
    await assert.rejects(
      run(stateFor({ a: { dev: { module: 'src/a.ts', export: 'aDev' } } })),
      /addon is not installed/
    )
  })

  test('an export that is not a contributor is an error', async () => {
    install('addon', ['src/a.ts'])
    modules['src/a.ts'] = { aDev: { provides: [] } }
    await assert.rejects(
      run(stateFor({ a: { dev: { module: 'src/a.ts', export: 'aDev' } } })),
      /is not a contributor/
    )
  })

  test('when is evaluated before the clash check, and a loser is skipped', async () => {
    install('addon', ['src/a.ts'])
    modules['src/a.ts'] = {
      pg: {
        provides: ['store'],
        when: (p: any) => p.db?.engine === 'postgres',
        run() {},
      },
      lite: {
        provides: ['store'],
        when: (p: any) => p.db?.engine === 'sqlite',
        run() {},
      },
    }
    const state = stateFor({
      pg: { dev: { module: 'src/a.ts', export: 'pg' } },
      lite: { dev: { module: 'src/a.ts', export: 'lite' } },
    })
    const result = await run(state, 'dev', {
      ...platform,
      db: { engine: 'sqlite' },
    })
    assert.deepEqual(
      result.ordered.map((c) => c.name),
      ['lite']
    )
    assert.deepEqual(
      result.skipped.map((s) => s.name),
      ['pg']
    )
  })

  test('two contributors providing one key error naming both', async () => {
    install('addon', ['src/a.ts'])
    modules['src/a.ts'] = {
      one: { provides: ['k'], run() {} },
      two: { provides: ['k'], run() {} },
    }
    await assert.rejects(
      run(
        stateFor({
          one: { dev: { module: 'src/a.ts', export: 'one' } },
          two: { dev: { module: 'src/a.ts', export: 'two' } },
        })
      ),
      (error: Error) =>
        error instanceof ContributorDependencyError &&
        /'one' and 'two' both provide 'k'/.test(error.message)
    )
  })

  test('an unmet need errors', async () => {
    install('addon', ['src/a.ts'])
    modules['src/a.ts'] = { a: { provides: ['a'], needs: ['ghost'], run() {} } }
    await assert.rejects(
      run(stateFor({ a: { dev: { module: 'src/a.ts', export: 'a' } } })),
      /needs 'ghost', which nothing provides/
    )
  })

  test('a widened platform reaches when', async () => {
    install('addon', ['src/a.ts'])
    modules['src/a.ts'] = {
      a: { provides: ['a'], when: (p: any) => p.unit === 'api', run() {} },
    }
    const state = stateFor({ a: { dev: { module: 'src/a.ts', export: 'a' } } })
    assert.equal(
      (await run(state, 'dev', { ...platform, unit: 'api' })).ordered.length,
      1
    )
    assert.equal(
      (await run(state, 'dev', { ...platform, unit: 'worker' })).ordered.length,
      0
    )
  })
})
