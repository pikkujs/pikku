import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DIRECT_EXECUTION_GUARD } from './serialize-cli-entrypoint-guard.js'

/**
 * Writes the emitted guard into a module that reports what it decided, and runs
 * it both directly and through a symlinked bin — the shape every CLI installed
 * into node_modules/.bin actually takes.
 */
const runGuard = (): { direct: string; viaSymlink: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-entry-guard-'))
  const entry = join(dir, 'entry.mjs')
  writeFileSync(
    entry,
    `${DIRECT_EXECUTION_GUARD}\nconsole.log(String(isDirectExecution))\n`
  )

  const binDir = join(dir, 'bin')
  mkdirSync(binDir)
  const link = join(binDir, 'cli.mjs')
  symlinkSync(entry, link)

  const run = (script: string) =>
    execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim()

  return { direct: run(entry), viaSymlink: run(link) }
}

describe('DIRECT_EXECUTION_GUARD', () => {
  test('resolves true when the module is the entrypoint, directly and through a symlinked bin', () => {
    const { direct, viaSymlink } = runGuard()
    assert.strictEqual(direct, 'true')
    // The regression: `import.meta.url === \`file://${process.argv[1]}\`` is
    // false here, because Node puts the symlink in argv and the realpath in the
    // URL, so the direct-execution block never ran for an installed CLI.
    assert.strictEqual(viaSymlink, 'true')
  })

  test('resolves false when the module is imported rather than executed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-entry-guard-'))
    const lib = join(dir, 'lib.mjs')
    writeFileSync(
      lib,
      `${DIRECT_EXECUTION_GUARD}\nconsole.log(String(isDirectExecution))\n`
    )
    const main = join(dir, 'main.mjs')
    writeFileSync(main, `await import('./lib.mjs')\n`)

    const out = execFileSync(process.execPath, [main], {
      encoding: 'utf8',
    }).trim()
    assert.strictEqual(out, 'false')
  })

  test('does not compare import.meta.url against a hand-built file:// argv path', () => {
    assert.doesNotMatch(DIRECT_EXECUTION_GUARD, /file:\/\/\$\{process\.argv/)
  })
})
