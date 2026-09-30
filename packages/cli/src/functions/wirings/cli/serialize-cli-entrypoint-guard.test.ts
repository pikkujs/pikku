import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DIRECT_EXECUTION_GUARD } from './serialize-cli-entrypoint-guard.js'

const execFileAsync = promisify(execFile)

// Async on purpose: bun's spawnSync can miss a child's exit and spin forever.
const runNode = async (script: string) =>
  (
    await execFileAsync(process.execPath, [script], { encoding: 'utf8' })
  ).stdout.trim()

/**
 * Writes the emitted guard into a module that reports what it decided, and runs
 * it both directly and through a symlinked bin — the shape every CLI installed
 * into node_modules/.bin actually takes.
 *
 * `String(...)` because `console.log` of a bare boolean goes through
 * `util.inspect`, which wraps it in ANSI yellow whenever colour is forced — and
 * `yarn` forces it, so these assertions compared `'\x1B[33mfalse\x1B[39m'`
 * against `'false'` under the pre-push hook while passing when run by hand.
 */
const runGuard = async (): Promise<{ direct: string; viaSymlink: string }> => {
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

  return { direct: await runNode(entry), viaSymlink: await runNode(link) }
}

describe('DIRECT_EXECUTION_GUARD', () => {
  test('resolves true when the module is the entrypoint, directly and through a symlinked bin', async () => {
    const { direct, viaSymlink } = await runGuard()
    assert.strictEqual(direct, 'true')
    // The regression: `import.meta.url === \`file://${process.argv[1]}\`` is
    // false here, because Node puts the symlink in argv and the realpath in the
    // URL, so the direct-execution block never ran for an installed CLI.
    assert.strictEqual(viaSymlink, 'true')
  })

  test('resolves false when the module is imported rather than executed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-entry-guard-'))
    const lib = join(dir, 'lib.mjs')
    writeFileSync(
      lib,
      `${DIRECT_EXECUTION_GUARD}\nconsole.log(String(isDirectExecution))\n`
    )
    const main = join(dir, 'main.mjs')
    writeFileSync(main, `await import('./lib.mjs')\n`)

    const out = await runNode(main)
    assert.strictEqual(out, 'false')
  })

  test('does not compare import.meta.url against a hand-built file:// argv path', () => {
    assert.doesNotMatch(DIRECT_EXECUTION_GUARD, /file:\/\/\$\{process\.argv/)
  })
})
