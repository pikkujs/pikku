import assert from 'node:assert/strict'
import { rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { HarnessInfraError } from './finding.js'
import { gitIn } from './git.js'
import { globToRegExp, guardWrites, snapshotTree } from './write-guard.js'
import { removeThrowaways, throwawayRepo } from './test-support.js'

after(removeThrowaways)

describe('globToRegExp', () => {
  const matches = (glob: string, path: string) => globToRegExp(glob).test(path)

  test('.pikku/**', () => {
    assert.ok(matches('.pikku/**', '.pikku/a.ts'))
    assert.ok(matches('.pikku/**', '.pikku/deep/b/c.json'))
    assert.ok(!matches('.pikku/**', 'src/.pikku/a.ts'))
    assert.ok(!matches('.pikku/**', '.pikkux/a.ts'))
  })

  test('**/*.{ts,tsx}', () => {
    assert.ok(matches('**/*.{ts,tsx}', 'a.ts'))
    assert.ok(matches('**/*.{ts,tsx}', 'src/deep/b.tsx'))
    assert.ok(!matches('**/*.{ts,tsx}', 'src/b.json'))
    assert.ok(!matches('**/*.{ts,tsx}', 'src/b.ts.orig'))
  })
})

describe('guardWrites', () => {
  test('a change inside the allowlist passes and is returned', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    const before = await snapshotTree(repo)
    await mkdir(join(repo, '.pikku'), { recursive: true })
    await writeFile(join(repo, '.pikku/meta.json'), '{}')
    assert.deepEqual(
      await guardWrites({ worktree: repo, before, gate: 'check' }),
      ['.pikku/meta.json']
    )
  })

  test('a change outside the allowlist is an infra error naming the path', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    const before = await snapshotTree(repo)
    await writeFile(join(repo, 'src/a.ts'), 'export const a = 2\n')
    await assert.rejects(
      guardWrites({ worktree: repo, before, gate: 'check' }),
      (error) =>
        error instanceof HarnessInfraError &&
        error.kind === 'write-outside-allowlist' &&
        /src\/a\.ts/.test(error.message)
    )
  })

  test('a fixer may change sources its writes cover, but not other files', async () => {
    const repo = await throwawayRepo({
      'src/a.ts': 'a\n',
      'package.json': '{}\n',
    })
    const writes = ['**/*.{ts,tsx}']
    let before = await snapshotTree(repo)
    await writeFile(join(repo, 'src/a.ts'), 'b\n')
    assert.deepEqual(
      await guardWrites({ worktree: repo, before, writes, gate: 'oxfmt' }),
      ['src/a.ts']
    )
    before = await snapshotTree(repo)
    await rm(join(repo, 'package.json'))
    await assert.rejects(
      guardWrites({ worktree: repo, before, writes, gate: 'oxfmt' }),
      /package\.json/
    )
  })

  test('a second edit to an already dirty file outside the allowlist is caught', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'a\n' })
    await writeFile(join(repo, 'src/a.ts'), 'dirty\n')
    const before = await snapshotTree(repo)
    await writeFile(join(repo, 'src/a.ts'), 'dirtier\n')
    await assert.rejects(
      guardWrites({ worktree: repo, before, gate: 'check' }),
      /src\/a\.ts/
    )
  })

  test('a new untracked file in a new folder is caught', async () => {
    const repo = await throwawayRepo()
    const before = await snapshotTree(repo)
    await mkdir(join(repo, 'new/dir'), { recursive: true })
    await writeFile(join(repo, 'new/dir/x.txt'), 'x')
    await assert.rejects(
      guardWrites({ worktree: repo, before, gate: 'check' }),
      /new\/dir\/x\.txt/
    )
  })

  test('a staged rename is caught on both paths', async () => {
    const repo = await throwawayRepo({ 'a.txt': 'a\n' })
    const before = await snapshotTree(repo)
    await gitIn(repo)(['mv', 'a.txt', 'b.txt'])
    await assert.rejects(
      guardWrites({ worktree: repo, before, gate: 'check' }),
      /a\.txt, b\.txt/
    )
  })
})
