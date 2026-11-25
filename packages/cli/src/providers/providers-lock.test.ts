import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { ErrorCode, emptyAddonsLock, readAddonsLock } from '@pikku/inspector'
import type { AddonsLock, ProviderLockEntry } from '@pikku/inspector'
import {
  checkProviderLock,
  diffProviderSurface,
  providerLockEntries,
  syncProvidersLock,
} from './providers-lock.js'

const entry = (extra: Partial<ProviderLockEntry> = {}): ProviderLockEntry => ({
  package: '@acme/addon',
  version: '1.0.0',
  metaHash: 'sha256-a',
  kind: 'singleton',
  provides: ['cache'],
  optionalProvides: [],
  imports: ['logger'],
  optionalImports: [],
  addsTo: null,
  replaces: [],
  ...extra,
})

const lockOf = (providers: Record<string, ProviderLockEntry>): AddonsLock => ({
  ...emptyAddonsLock(),
  providers,
})

const codeOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return (error as { code: string }).code + ' ' + (error as Error).message
  }
  assert.fail('expected a build error')
}

describe('providerLockEntries', () => {
  const state = (providers: Record<string, any>) =>
    ({
      optedInProviders: {
        nats: { packageName: '@acme/nats', providers, collections: {} },
      },
      rpc: { wireAddonDeclarations: new Map() },
    }) as never

  test('records the surface, minus what sibling providers provide', () => {
    const entries = providerLockEntries(
      state({
        nats: {
          kind: 'singleton',
          module: 'src/nats.ts',
          export: 'nats',
          variants: {
            deploy: {
              needs: ['lifecycle', 'logger', 'queue'],
              optional: ['queue'],
              provides: ['queueService'],
              optionalProvides: [],
            },
          },
          replaces: ['logger'],
        },
        lifecycle: {
          kind: 'singleton',
          module: 'src/nats.ts',
          export: 'lifecycle',
          variants: {
            common: { needs: [], optional: [], provides: ['lifecycle'] },
          },
        },
      }),
      '/nowhere'
    )
    const nats = entries['nats/nats']!
    assert.deepEqual(nats.provides, ['queueService'])
    assert.deepEqual(nats.imports, ['logger'])
    assert.deepEqual(nats.optionalImports, ['queue'])
    assert.deepEqual(nats.replaces, ['logger'])
    assert.equal(nats.addsTo, null)
    assert.match(nats.metaHash, /^sha256-[0-9a-f]{64}$/)
    assert.deepEqual(Object.keys(entries), ['nats/nats', 'nats/lifecycle'])
  })

  test('the same meta hashes the same, whatever its key order', () => {
    const a = { kind: 'singleton', module: 'm', export: 'p', variants: {} }
    const b = { variants: {}, export: 'p', module: 'm', kind: 'singleton' }
    assert.equal(
      providerLockEntries(state({ p: a }), '/x')['nats/p']!.metaHash,
      providerLockEntries(state({ p: b }), '/x')['nats/p']!.metaHash
    )
  })
})

describe('checkProviderLock', () => {
  test('a provider the lock has not seen is recorded', () => {
    const { providers, recorded } = checkProviderLock({
      current: { 'a/x': entry() },
      lock: emptyAddonsLock(),
      frozen: false,
    })
    assert.deepEqual(recorded, ['a/x'])
    assert.deepEqual(Object.keys(providers), ['a/x'])
  })

  test('frozen: a new provider is PKU396', () => {
    const out = codeOf(() =>
      checkProviderLock({
        current: { 'a/x': entry() },
        lock: emptyAddonsLock(),
        frozen: true,
      })
    )
    assert.match(out, /^PKU396 .*addon provider 'a\/x' is new\./)
  })

  test('a surface change is PKU395 with the diff', () => {
    const out = codeOf(() =>
      checkProviderLock({
        current: { 'a/x': entry({ imports: ['kysely', 'logger'] }) },
        lock: lockOf({ 'a/x': entry() }),
        frozen: false,
      })
    )
    assert.match(out, /^PKU395 /)
    assert.match(out, /\+ imports kysely/)
    assert.match(out, /--approve-providers a\/x/)
  })

  test('an added replacement and a dropped provide show as such', () => {
    assert.deepEqual(
      diffProviderSurface(
        entry({ provides: ['cache', 'old'] }),
        entry({ replaces: ['secrets'] })
      ),
      ['- provides old', '+ replaces secrets']
    )
  })

  test('approving the id, or everything, accepts the change', () => {
    const current = { 'a/x': entry({ addsTo: 'sinks' }) }
    const lock = lockOf({ 'a/x': entry() })
    for (const approval of [true, ['a/x']] as const) {
      const { providers } = checkProviderLock({
        current,
        lock,
        frozen: false,
        approval,
      })
      assert.equal(providers['a/x']!.addsTo, 'sinks')
    }
    assert.match(
      codeOf(() =>
        checkProviderLock({ current, lock, frozen: false, approval: ['b/y'] })
      ),
      /^PKU395/
    )
  })

  test('a version bump with the same surface is rewritten silently', () => {
    const { providers, recorded } = checkProviderLock({
      current: { 'a/x': entry({ version: '1.1.0', metaHash: 'sha256-b' }) },
      lock: lockOf({ 'a/x': entry() }),
      frozen: false,
    })
    assert.equal(providers['a/x']!.version, '1.1.0')
    assert.deepEqual(recorded, [])
  })

  test('frozen: a version bump with the same surface is accepted and the approved entry is kept', () => {
    const { providers } = checkProviderLock({
      current: { 'a/x': entry({ version: '1.1.0', metaHash: 'sha256-b' }) },
      lock: lockOf({ 'a/x': entry() }),
      frozen: true,
    })
    assert.equal(providers['a/x']!.version, '1.0.0')
    assert.equal(providers['a/x']!.metaHash, 'sha256-a')
  })

  test('a provider no longer opted in is dropped, and frozen it is PKU396', () => {
    const lock = lockOf({ 'a/x': entry() })
    assert.deepEqual(
      checkProviderLock({ current: {}, lock, frozen: false }).providers,
      {}
    )
    assert.match(
      codeOf(() => checkProviderLock({ current: {}, lock, frozen: true })),
      /^PKU396 .*'a\/x' was removed\./
    )
  })

  test('an unchanged provider passes frozen', () => {
    const { providers } = checkProviderLock({
      current: { 'a/x': entry() },
      lock: lockOf({ 'a/x': entry() }),
      frozen: true,
    })
    assert.deepEqual(Object.keys(providers), ['a/x'])
  })

  test('a hand-edited lock granting more than the addon asks for passes only as its own surface', () => {
    assert.match(
      codeOf(() =>
        checkProviderLock({
          current: { 'a/x': entry() },
          lock: lockOf({ 'a/x': entry({ imports: ['logger', 'secrets'] }) }),
          frozen: false,
        })
      ),
      /- imports secrets/
    )
  })
})

describe('syncProvidersLock', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })
  const project = () => {
    const root = join(import.meta.dir, '../..', '.tmp')
    mkdirSync(root, { recursive: true })
    const dir = mkdtempSync(join(root, 'lock-'))
    dirs.push(dir)
    return dir
  }
  const state = (names: string[]) =>
    ({
      optedInProviders: {
        a: {
          packageName: '@acme/addon',
          collections: {},
          providers: Object.fromEntries(
            names.map((name) => [
              name,
              {
                kind: 'singleton',
                module: 'm',
                export: name,
                variants: {
                  common: { needs: ['logger'], provides: [name] },
                },
              },
            ])
          ),
        },
      },
      rpc: { wireAddonDeclarations: new Map() },
    }) as never

  test('writes the providers beside the sdks, and the same build twice writes the same bytes', async () => {
    const rootDir = project()
    const messages: string[] = []
    const run = () =>
      syncProvidersLock({
        state: state(['x']),
        rootDir,
        frozen: false,
        log: (message) => messages.push(message),
      })
    await run()
    const first = readFileSync(join(rootDir, 'pikku-addons.lock'), 'utf8')
    await run()
    assert.equal(
      readFileSync(join(rootDir, 'pikku-addons.lock'), 'utf8'),
      first
    )
    assert.equal(messages.length, 1)
    assert.match(
      messages[0]!,
      /recorded addon provider 'a\/x' \(@acme\/addon@0\.0\.0\)/
    )
    assert.deepEqual(Object.keys(readAddonsLock(rootDir).providers), ['a/x'])
  })

  test('writes no lock for a project with no addon providers', async () => {
    const rootDir = project()
    await syncProvidersLock({
      state: state([]),
      rootDir,
      frozen: true,
      log: () => {},
    })
    assert.throws(() => readFileSync(join(rootDir, 'pikku-addons.lock')))
  })

  test('keeps the sdks section it did not write', async () => {
    const rootDir = project()
    writeFileSync(
      join(rootDir, 'pikku-addons.lock'),
      JSON.stringify({
        lockfileVersion: 1,
        sdks: {
          '@r/a': { range: '^1', version: '1.0.0', integrity: 'sha512-x' },
        },
      })
    )
    await syncProvidersLock({
      state: state(['x']),
      rootDir,
      frozen: false,
      log: () => {},
    })
    const lock = readAddonsLock(rootDir)
    assert.equal(lock.lockfileVersion, 2)
    assert.deepEqual(Object.keys(lock.sdks), ['@r/a'])
    assert.deepEqual(Object.keys(lock.providers), ['a/x'])
  })

  test('frozen: a version bump with the same surface writes nothing and passes', async () => {
    const rootDir = project()
    await syncProvidersLock({
      state: state(['x']),
      rootDir,
      frozen: false,
      log: () => {},
    })
    const before = readFileSync(join(rootDir, 'pikku-addons.lock'), 'utf8')
    mkdirSync(join(rootDir, 'node_modules/@acme/addon'), { recursive: true })
    writeFileSync(
      join(rootDir, 'node_modules/@acme/addon/package.json'),
      JSON.stringify({ name: '@acme/addon', version: '9.9.9' })
    )
    await syncProvidersLock({
      state: state(['x']),
      rootDir,
      frozen: true,
      log: () => {},
    })
    assert.equal(
      readFileSync(join(rootDir, 'pikku-addons.lock'), 'utf8'),
      before
    )
  })

  test('a version 1 lock with no addon providers is not rewritten or refused, frozen or not', async () => {
    const rootDir = project()
    const v1 = JSON.stringify({
      lockfileVersion: 1,
      sdks: {
        '@r/a': { range: '^1', version: '1.0.0', integrity: 'sha512-x' },
      },
    })
    writeFileSync(join(rootDir, 'pikku-addons.lock'), v1)
    for (const frozen of [true, false]) {
      await syncProvidersLock({
        state: {
          optedInProviders: {},
          rpc: { wireAddonDeclarations: new Map() },
        } as never,
        rootDir,
        frozen,
        log: () => {},
      })
      assert.equal(readFileSync(join(rootDir, 'pikku-addons.lock'), 'utf8'), v1)
    }
  })

  test('frozen refuses to write a lock a provider would change', async () => {
    const rootDir = project()
    await assert.rejects(
      syncProvidersLock({
        state: state(['x']),
        rootDir,
        frozen: true,
        log: () => {},
      }),
      (error: { code?: string }) =>
        error.code === ErrorCode.PROVIDER_LOCK_FROZEN
    )
  })
})
