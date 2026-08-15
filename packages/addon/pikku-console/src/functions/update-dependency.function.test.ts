import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SecurityAuditReport } from '@pikku/core/ecosystem/types'
import { updateDependency } from './update-dependency.function.js'

/**
 * A throwaway project with a stub `bun` and a stub `pikku` so the whole
 * bump → install → re-audit chain runs without a registry. Both stubs record
 * that they were called, and in which order, by appending to `calls.log`.
 */
const project = (manifest: Record<string, unknown>) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-update-dep-'))
  const pkgPath = join(root, 'package.json')
  writeFileSync(pkgPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const log = join(root, 'calls.log')
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  const bun = join(bin, 'bun')
  // Records the manifest as it stood when install ran, proving the bump landed
  // on disk before the lockfile was resolved against it.
  writeFileSync(
    bun,
    `#!/bin/sh\necho "bun $* $(cat '${pkgPath}' | tr -d '\\n ')" >> '${log}'\n`
  )
  chmodSync(bun, 0o755)

  const pikkuBin = join(root, 'node_modules', '.bin', 'pikku')
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
  const report: SecurityAuditReport = {
    schemaVersion: 1,
    tool: 'bun',
    generatedAt: '2026-08-15T00:00:00.000Z',
    issues: [],
    updates: [],
    summary: {
      totalIssues: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      totalUpdates: 0,
      major: 0,
      minor: 0,
      patch: 0,
    },
  }
  const auditPath = join(root, '.pikku', 'audit.json')
  writeFileSync(
    pikkuBin,
    `import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'\n` +
      `appendFileSync(${JSON.stringify(log)}, 'pikku ' + process.argv.slice(2).join(' ') + '\\n')\n` +
      `mkdirSync(${JSON.stringify(join(root, '.pikku'))}, { recursive: true })\n` +
      `writeFileSync(${JSON.stringify(auditPath)}, ${JSON.stringify(JSON.stringify(report))})\n`
  )

  const metaService = {
    basePath: join(root, '.pikku'),
    readFile: async (relativePath: string) => {
      const path = join(root, '.pikku', relativePath)
      return existsSync(path) ? readFileSync(path, 'utf-8') : null
    },
  }

  return {
    root,
    bin,
    metaService,
    manifest: () => JSON.parse(readFileSync(pkgPath, 'utf-8')),
    calls: () => (existsSync(log) ? readFileSync(log, 'utf-8') : ''),
  }
}

const invoke = async (
  metaService: unknown,
  input: { package: string; version: string },
  bin?: string
) => {
  const previousPath = process.env.PATH
  if (bin) process.env.PATH = `${bin}:${previousPath}`
  try {
    return (await updateDependency.func(
      { metaService } as never,
      input as never,
      {} as never
    )) as SecurityAuditReport | null
  } finally {
    process.env.PATH = previousPath
  }
}

describe('updateDependency version guard', () => {
  // The version reaches `bun install` and package.json, so anything that is not
  // a concrete semver is an install specifier the caller should not control.
  test('refuses anything that is not a concrete semver', async () => {
    for (const version of [
      'latest',
      '^1.2.3',
      '~1.2.3',
      '>=1.2.3',
      '1.2',
      '../evil',
      'file:../evil',
      'https://evil.test/pkg.tgz',
      'npm:other@1.0.0',
      '1.2.3 && rm -rf /',
      '',
    ]) {
      await assert.rejects(
        invoke({ basePath: '/tmp/.pikku' }, { package: 'lodash', version }),
        /Invalid version/,
        version
      )
    }
  })

  test('accepts a plain semver and a prerelease or build tag', async () => {
    for (const version of ['1.2.3', '1.2.3-rc.1', '1.2.3+build.5']) {
      // Rejected later for a missing package.json — but past the version guard,
      // which is what this asserts.
      await assert.rejects(
        invoke(
          {
            basePath: join(
              mkdtempSync(join(tmpdir(), 'pikku-none-')),
              '.pikku'
            ),
          },
          { package: 'lodash', version }
        ),
        /package.json not found/,
        version
      )
    }
  })
})

describe('updateDependency preconditions', () => {
  test('refuses to run without a configured meta service', async () => {
    await assert.rejects(
      invoke(undefined, { package: 'lodash', version: '1.2.3' }),
      /Meta service is not configured/
    )
    await assert.rejects(
      invoke({}, { package: 'lodash', version: '1.2.3' }),
      /Meta service is not configured/
    )
  })

  test('refuses a package that is not a direct dependency', async () => {
    const p = project({ name: 'app', dependencies: { zod: '^3.0.0' } })
    await assert.rejects(
      invoke(p.metaService, { package: 'lodash', version: '4.17.21' }, p.bin),
      /not a direct dependency/
    )
    assert.equal(p.calls(), '', 'nothing should have been installed')
  })

  // A workspace:/file:/git specifier carries resolution semantics that a bare
  // version silently destroys — refusing beats clobbering the manifest.
  test('refuses to overwrite a non-semver specifier', async () => {
    for (const specifier of [
      'workspace:*',
      'file:../core',
      'link:../core',
      'git+https://github.com/x/y.git',
      'github:x/y',
      'https://example.test/x.tgz',
      'npm:other@1.0.0',
    ]) {
      const p = project({ name: 'app', dependencies: { core: specifier } })
      await assert.rejects(
        invoke(p.metaService, { package: 'core', version: '1.2.3' }, p.bin),
        /non-semver specifier/,
        specifier
      )
      assert.equal(p.manifest().dependencies.core, specifier, specifier)
    }
  })
})

describe('updateDependency bump', () => {
  test('bumps the version while keeping the range operator', async () => {
    for (const [before, after] of [
      ['^4.17.20', '^4.17.21'],
      ['~4.17.20', '~4.17.21'],
      ['4.17.20', '4.17.21'],
    ]) {
      const p = project({ name: 'app', dependencies: { lodash: before! } })
      await invoke(
        p.metaService,
        { package: 'lodash', version: '4.17.21' },
        p.bin
      )
      assert.equal(p.manifest().dependencies.lodash, after, before)
    }
  })

  test('finds the package in whichever dependency section holds it', async () => {
    for (const section of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      const p = project({ name: 'app', [section]: { lodash: '^4.17.20' } })
      await invoke(
        p.metaService,
        { package: 'lodash', version: '4.17.21' },
        p.bin
      )
      assert.equal(p.manifest()[section].lodash, '^4.17.21', section)
    }
  })

  test('installs against the already-bumped manifest, then re-audits', async () => {
    const p = project({ name: 'app', dependencies: { lodash: '^4.17.20' } })
    await invoke(
      p.metaService,
      { package: 'lodash', version: '4.17.21' },
      p.bin
    )

    const calls = p.calls().trim().split('\n')
    assert.match(calls[0]!, /^bun install/)
    assert.match(calls[0]!, /4\.17\.21/)
    assert.ok(!calls[0]!.includes('4.17.20'))
    assert.match(calls[1]!, /^pikku .*audit --outdated/)
  })

  test('returns the report regenerated by the re-audit', async () => {
    const p = project({ name: 'app', dependencies: { lodash: '^4.17.20' } })
    const report = await invoke(
      p.metaService,
      { package: 'lodash', version: '4.17.21' },
      p.bin
    )
    assert.equal(report?.summary.totalIssues, 0)
    assert.equal(report?.tool, 'bun')
  })

  // A failed install leaves the lockfile and node_modules disagreeing with the
  // manifest, so it has to surface rather than resolve into a fresh report.
  test('surfaces a failed install instead of reporting success', async () => {
    const p = project({ name: 'app', dependencies: { lodash: '^4.17.20' } })
    writeFileSync(
      join(p.bin, 'bun'),
      '#!/bin/sh\necho "error: no version matching 4.17.21" >&2\nexit 1\n'
    )
    chmodSync(join(p.bin, 'bun'), 0o755)

    await assert.rejects(
      invoke(p.metaService, { package: 'lodash', version: '4.17.21' }, p.bin),
      /no version matching 4\.17\.21/
    )
  })
})
