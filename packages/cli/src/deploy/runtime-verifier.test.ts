import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CloudSupportData, RuntimeProfile } from '@pikku/deploy'

import {
  resolveTargetTier,
  verifyUnitRuntime,
  verifyUnitsRuntime,
} from './runtime-verifier.js'

const profile = (over: Partial<RuntimeProfile> = {}): RuntimeProfile => ({
  tier: 'serverless',
  compatDate: '2024-12-18',
  compatFlags: ['nodejs_compat_v2'],
  allowedBuiltins: ['crypto', 'path'],
  stubbedBuiltins: ['fs'],
  externals: [],
  ...over,
})

describe('runtime tier verifier (real esbuild bundles)', () => {
  let dir: string

  // Tiers come from cloudsupport, not package.json: a fixture's `pikku.runtime`
  // is turned into an entry here.
  const support: CloudSupportData = { schemaVersion: 1, packages: {} }
  const TIERS = {
    edge: { edge: ['cloudflare-workers'], serverless: true },
    serverless: { edge: false, serverless: true },
    server: { edge: false, serverless: false },
  } as const

  const pkg = async (
    name: string,
    { pikku, ...json }: Record<string, unknown>,
    source: string
  ) => {
    if (pikku) {
      const runtime = (pikku as { runtime: keyof typeof TIERS }).runtime
      support.packages[name] = [
        {
          versions: '*',
          cloud: { ...TIERS[runtime] } as never,
          reason: 'test fixture',
        },
      ]
    }
    const root = join(dir, 'node_modules', name)
    await mkdir(root, { recursive: true })
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name, type: 'module', main: 'index.js', ...json })
    )
    await writeFile(join(root, 'index.js'), source)
  }

  const entry = async (file: string, source: string) => {
    const path = join(dir, file)
    await writeFile(path, source)
    return path
  }

  before(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'pikku-tier-')))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'app' }))
    await pkg(
      'edge-lib',
      { pikku: { runtime: 'edge' } },
      'export const edge = () => new URL("https://x").href'
    )
    await pkg(
      'serverless-lib',
      { pikku: { runtime: 'serverless' } },
      'import { createHash } from "node:crypto"\nexport const hash = () => createHash("sha1").digest("hex")'
    )
    await pkg(
      'server-lib',
      { pikku: { runtime: 'server' } },
      'import { hostname } from "node:os"\nexport const host = () => hostname()'
    )
    await pkg(
      'plain-lib',
      {},
      'import { readFileSync } from "fs"\nexport const read = () => readFileSync("/x")'
    )
    // Stand-ins for `@pikku/core/scope` (declareScopes is a no-op) and the
    // server-tier console addon.
    await pkg(
      'scope-lib',
      { pikku: { runtime: 'edge' } },
      'export const declareScopes = () => {}'
    )
    await pkg(
      '@pikku/addon-console',
      { pikku: { runtime: 'server' } },
      'import { hostname } from "node:os"\nexport const consoleHost = () => hostname()'
    )
    await pkg(
      'memory-lib',
      { pikku: { runtime: 'edge' } },
      'export class InMemorySessionStore { m = new Map() }\nexport const s = new InMemorySessionStore()'
    )
  })
  after(() => rm(dir, { recursive: true, force: true }))

  const verify = async (
    name: string,
    source: string,
    unitTier: 'edge' | 'serverless',
    p = profile()
  ) => {
    const result = await verifyUnitRuntime({
      unit: { name },
      entryPath: await entry(`${name}.ts`, source),
      projectDir: dir,
      support,
      profile:
        unitTier === 'edge'
          ? profile({ tier: 'edge', allowedBuiltins: [], compatFlags: [] })
          : p,
      unitTier,
    })
    assert.equal(result.status, 'checked')
    return result.status === 'checked' ? result.analysis : (undefined as never)
  }

  it('fails an edge unit that imports a server-tier package', async () => {
    const a = await verify(
      'edge-server',
      'import { host } from "server-lib"\nconsole.log(host())',
      'edge'
    )
    const pkgViolation = a.violations.find(
      (v) => v.kind === 'package-tier' && v.packageName === 'server-lib'
    )
    assert.ok(pkgViolation, JSON.stringify(a.violations))
    assert.ok(
      a.violations.some(
        (v) => v.kind === 'builtin' && v.specifier === 'node:os'
      )
    )
  })

  it('keeps @pikku/addon-console out of a unit that only declares pikku:console', async () => {
    const a = await verify(
      'scope-only',
      'import { declareScopes } from "scope-lib"\ndeclareScopes(["pikku:console"])',
      'serverless'
    )
    assert.deepEqual(a.violations, [])
  })

  it('fails a unit that wires @pikku/addon-console', async () => {
    const a = await verify(
      'scope-wired',
      'import { consoleHost } from "@pikku/addon-console"\nconsole.log(consoleHost())',
      'serverless'
    )
    assert.ok(
      a.violations.some(
        (v) =>
          v.kind === 'package-tier' && v.packageName === '@pikku/addon-console'
      ),
      JSON.stringify(a.violations)
    )
  })

  it('fails an edge unit that imports a serverless package', async () => {
    const a = await verify(
      'edge-serverless',
      'import { hash } from "serverless-lib"\nconsole.log(hash())',
      'edge'
    )
    assert.ok(
      a.violations.some(
        (v) => v.kind === 'package-tier' && v.packageName === 'serverless-lib'
      )
    )
  })

  it('passes a serverless unit that imports a serverless package', async () => {
    const a = await verify(
      'sl-serverless',
      'import { hash } from "serverless-lib"\nimport { edge } from "edge-lib"\nconsole.log(hash(), edge())',
      'serverless'
    )
    assert.deepEqual(a.violations, [])
  })

  it('fails a serverless unit that imports a server-tier package', async () => {
    const a = await verify(
      'sl-server',
      'import { host } from "server-lib"\nconsole.log(host())',
      'serverless'
    )
    assert.ok(a.violations.length >= 1)
  })

  it('passes an edge unit that imports only edge packages', async () => {
    const a = await verify(
      'edge-ok',
      'import { edge } from "edge-lib"\nconsole.log(edge())',
      'edge'
    )
    assert.deepEqual(a.violations, [])
  })

  it('reports a bare builtin the provider stubs as a warning, not a pass', async () => {
    const a = await verify(
      'sl-fs',
      'import { read } from "plain-lib"\nconsole.log(read())',
      'serverless'
    )
    assert.deepEqual(a.violations, [])
    assert.deepEqual(
      a.warnings.map((w) => [w.kind, w.specifier]),
      [['stubbed-builtin', 'fs']]
    )
  })

  it('fails the same bare builtin when nothing stubs it', async () => {
    const a = await verify(
      'sl-fs-unstubbed',
      'import { read } from "plain-lib"\nconsole.log(read())',
      'serverless',
      profile({ stubbedBuiltins: [] })
    )
    assert.deepEqual(
      a.violations.map((v) => v.kind === 'builtin' && v.specifier),
      ['fs']
    )
  })

  it('fails an edge unit that carries an InMemory service', async () => {
    const a = await verify(
      'edge-memory',
      'import { s } from "memory-lib"\nconsole.log(s)',
      'edge'
    )
    assert.ok(
      a.violations.some(
        (v) => v.kind === 'in-memory' && v.className === 'InMemorySessionStore'
      )
    )
  })

  it('reports a provider-stubbed package as a warning', async () => {
    const result = await verifyUnitRuntime({
      unit: { name: 'stubbed' },
      entryPath: await entry(
        'stubbed.ts',
        'import { read } from "plain-lib"\nconsole.log(read())'
      ),
      projectDir: dir,
      support,
      profile: profile(),
      unitTier: 'serverless',
      providerStubs: ['^plain-lib$'],
    })
    assert.equal(result.status, 'checked')
    if (result.status === 'checked') {
      assert.deepEqual(result.analysis.violations, [])
      assert.equal(result.analysis.warnings[0]?.kind, 'stubbed-module')
    }
  })

  it('skips, leaving the error to the real bundler, when an import does not resolve', async () => {
    const result = await verifyUnitRuntime({
      unit: { name: 'broken' },
      entryPath: await entry('broken.ts', 'import "does-not-exist"'),
      projectDir: dir,
      support,
      profile: profile(),
      unitTier: 'serverless',
    })
    assert.equal(result.status, 'skipped')
  })

  it('verifyUnitsRuntime returns an AI-parseable failure per unit and skips server units', async () => {
    const entryFiles = new Map([
      [
        'bad',
        await entry(
          'bad.ts',
          'import { host } from "server-lib"\nconsole.log(host())'
        ),
      ],
      [
        'good',
        await entry(
          'good.ts',
          'import { edge } from "edge-lib"\nconsole.log(edge())'
        ),
      ],
    ])
    const provider = {
      getRuntimeProfile: (tier?: 'edge' | 'serverless') =>
        profile({ tier: tier ?? 'serverless' }),
    } as never
    const unit = (name: string, target: 'serverless' | 'server') =>
      ({ name, target }) as never
    const out = await verifyUnitsRuntime({
      provider,
      units: [
        unit('bad', 'serverless'),
        unit('good', 'serverless'),
        unit('bad', 'server'),
      ],
      entryFiles,
      projectDir: dir,
      support,
    })
    assert.equal(out.failures.length, 1)
    assert.equal(out.failures[0]!.unitName, 'bad')
    assert.match(
      out.failures[0]!.error,
      /^RUNTIME_TIER_VIOLATION unit=bad unit-tier=serverless/
    )
    assert.match(
      out.failures[0]!.error,
      /package=server-lib package-tier=server/
    )
    assert.match(out.failures[0]!.error, /fix:/)
  })

  it('does nothing for a provider with no runtime profile', async () => {
    const out = await verifyUnitsRuntime({
      provider: {} as never,
      units: [{ name: 'x', target: 'serverless' } as never],
      entryFiles: new Map(),
      projectDir: dir,
      support,
    })
    assert.deepEqual(out, { failures: [], warnings: [] })
  })

  it('resolves the target tier: unit, then provider default, never above it', () => {
    assert.equal(resolveTargetTier({}, 'serverless'), 'serverless')
    assert.equal(resolveTargetTier({ runtime: 'edge' }, 'serverless'), 'edge')
    assert.equal(
      resolveTargetTier({ runtime: 'server' }, 'serverless'),
      'serverless'
    )
  })
})
