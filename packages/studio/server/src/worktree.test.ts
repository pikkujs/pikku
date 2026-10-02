import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { ensureWorktree, keepChanges, keepStatus } from './worktree.js'

const setup = async () => {
  const repo = mkdtempSync(join(tmpdir(), 'studio-keep-'))
  const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  sh(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'app.ts'), 'one\n')
  sh(repo, 'add', '-A')
  sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'start')
  const worktree = await ensureWorktree(repo, mkdtempSync(join(tmpdir(), 'studio-home-')), 'k1')
  return { repo, worktree, sh }
}

describe('keepChanges', () => {
  test('saves unsaved work and fast-forwards the folder, leaving builder scratch behind', async () => {
    const { repo, worktree, sh } = await setup()
    writeFileSync(join(worktree.path, 'app.ts'), 'two\n')
    execFileSync('mkdir', ['-p', join(worktree.path, '.pikku')])
    writeFileSync(join(worktree.path, '.pikku/looks.json'), '{}')
    assert.equal((await keepStatus(repo, worktree)).unsaved, 1)
    assert.deepEqual(await keepChanges(repo, worktree), { ok: true, kept: 1 })
    assert.equal(readFileSync(join(repo, 'app.ts'), 'utf8'), 'two\n')
    assert.equal(sh(repo, 'log', '-1', '--format=%s'), 'Changes from the builder')
    assert.deepEqual((await keepStatus(repo, worktree)).commits, [])
  })

  test('brings in what the folder moved on to before keeping', async () => {
    const { repo, worktree, sh } = await setup()
    writeFileSync(join(repo, 'notes.md'), 'mine\n')
    sh(repo, 'add', '-A')
    sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'mine')
    writeFileSync(join(worktree.path, 'app.ts'), 'two\n')
    assert.equal((await keepChanges(repo, worktree)).ok, true)
    assert.equal(readFileSync(join(repo, 'notes.md'), 'utf8'), 'mine\n')
    assert.equal(readFileSync(join(repo, 'app.ts'), 'utf8'), 'two\n')
  })

  test('a clash with the folder names the files and changes nothing', async () => {
    const { repo, worktree, sh } = await setup()
    writeFileSync(join(repo, 'app.ts'), 'mine\n')
    sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'mine')
    writeFileSync(join(worktree.path, 'app.ts'), 'theirs\n')
    assert.deepEqual(await keepChanges(repo, worktree), { ok: false, reason: 'conflict', files: ['app.ts'] })
    assert.equal(readFileSync(join(repo, 'app.ts'), 'utf8'), 'mine\n')
    assert.equal(sh(worktree.path, 'status', '--porcelain'), '')
  })

  test('unsaved edits in the folder block the keep and are named', async () => {
    const { repo, worktree } = await setup()
    writeFileSync(join(repo, 'app.ts'), 'editing\n')
    writeFileSync(join(worktree.path, 'app.ts'), 'two\n')
    assert.deepEqual(await keepChanges(repo, worktree), { ok: false, reason: 'edited', files: ['app.ts'] })
    assert.equal(readFileSync(join(repo, 'app.ts'), 'utf8'), 'editing\n')
  })
})
