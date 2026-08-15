import { strict as assert } from 'assert'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  describe('in a monorepo, where the workspace root is above the pikku root', () => {
    // The pikku root is wherever pikku.config.json sits, which in a monorepo is
    // a package dir carrying neither packageManager nor a lockfile. Both live
    // at the workspace root above it, so detection has to keep walking.
    const nestPikkuRoot = () => {
      const pikkuRoot = join(dir, 'packages', 'functions')
      mkdirSync(pikkuRoot, { recursive: true })
      writeFileSync(
        join(pikkuRoot, 'package.json'),
        JSON.stringify({ name: '@app/functions' }),
        'utf-8'
      )
      return pikkuRoot
    }

    test('reads packageManager from the workspace root', () => {
      writePkg({ packageManager: 'yarn@4.10.3' })
      assert.equal(resolvePackageManager(nestPikkuRoot()), 'yarn')
    })

    test('detects the workspace root lockfile', () => {
      writePkg({})
      writeFileSync(join(dir, 'yarn.lock'), '', 'utf-8')
      assert.equal(resolvePackageManager(nestPikkuRoot()), 'yarn')
    })

    test('the nearest declaration wins over the workspace root', () => {
      writePkg({ packageManager: 'yarn@4.10.3' })
      const pikkuRoot = nestPikkuRoot()
      writeFileSync(
        join(pikkuRoot, 'package.json'),
        JSON.stringify({ packageManager: 'pnpm@9.0.0' }),
        'utf-8'
      )
      assert.equal(resolvePackageManager(pikkuRoot), 'pnpm')
    })

    test('a nearer lockfile still loses to a declared packageManager above it', () => {
      // Lockfiles get copied around and go stale; the corepack field states
      // intent, so it outranks a lockfile found lower down.
      writePkg({ packageManager: 'yarn@4.10.3' })
      const pikkuRoot = nestPikkuRoot()
      writeFileSync(join(pikkuRoot, 'package-lock.json'), '', 'utf-8')
      assert.equal(resolvePackageManager(pikkuRoot), 'yarn')
    })

    test('still defaults to npm when the whole tree is silent', () => {
      writePkg({})
      assert.equal(resolvePackageManager(nestPikkuRoot()), 'npm')
    })
  })
})
