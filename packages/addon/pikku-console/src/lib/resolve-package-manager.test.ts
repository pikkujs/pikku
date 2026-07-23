import { strict as assert } from 'assert'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePackageManager } from './resolve-package-manager.js'

describe('resolvePackageManager', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pm-detect-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const writePkg = (pkg: object) =>
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg), 'utf-8')

  test('reads the packageManager field', () => {
    writePkg({ packageManager: 'bun@1.3.14' })
    assert.equal(resolvePackageManager(dir), 'bun')
  })

  test('packageManager wins over a stale lockfile', () => {
    writePkg({ packageManager: 'bun@1.3.14' })
    writeFileSync(join(dir, 'yarn.lock'), '', 'utf-8')
    assert.equal(resolvePackageManager(dir), 'bun')
  })

  test('detects bun from the text lockfile (bun >= 1.2)', () => {
    writePkg({})
    writeFileSync(join(dir, 'bun.lock'), '', 'utf-8')
    assert.equal(resolvePackageManager(dir), 'bun')
  })

  test('detects bun from the binary lockfile', () => {
    writeFileSync(join(dir, 'bun.lockb'), '', 'utf-8')
    assert.equal(resolvePackageManager(dir), 'bun')
  })

  test('detects yarn, pnpm and npm from their lockfiles', () => {
    for (const [lock, pm] of [
      ['yarn.lock', 'yarn'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['package-lock.json', 'npm'],
    ] as const) {
      const d = mkdtempSync(join(tmpdir(), 'pm-detect-'))
      writeFileSync(join(d, lock), '', 'utf-8')
      assert.equal(resolvePackageManager(d), pm)
      rmSync(d, { recursive: true, force: true })
    }
  })

  test('ignores an unknown packageManager and falls back', () => {
    writePkg({ packageManager: 'cargo@1.0.0' })
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '', 'utf-8')
    assert.equal(resolvePackageManager(dir), 'pnpm')
  })

  test('defaults to npm with no signals', () => {
    assert.equal(resolvePackageManager(dir), 'npm')
  })
})
