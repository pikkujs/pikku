import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { harnessEpoch } from './epoch.js'
import { gitIn } from './git.js'
import { removeThrowaways, throwawayRepo } from './test-support.js'

after(removeThrowaways)

describe('harnessEpoch', () => {
  test('is made on first use, kept in the git dir, and the same on every later call', async () => {
    const repo = await throwawayRepo()
    const first = await harnessEpoch(repo)
    assert.match(first, /^[a-f0-9]{12}$/)
    assert.equal(
      (
        await readFile(join(repo, '.git', 'pikku-harness', 'epoch'), 'utf8')
      ).trim(),
      first
    )
    assert.equal(await harnessEpoch(repo), first)
  })

  test('calls racing on a new worktree agree on one epoch', async () => {
    const repo = await throwawayRepo()
    const epochs = await Promise.all(
      Array.from({ length: 8 }, () => harnessEpoch(repo))
    )
    assert.equal(new Set(epochs).size, 1)
  })

  test('each worktree has its own, and a new worktree in the same place starts a new one', async () => {
    const repo = await throwawayRepo()
    const tree = `${repo}-wt`
    const git = gitIn(repo)
    await git(['worktree', 'add', '-q', '-b', 'changeset/one', tree])
    try {
      const main = await harnessEpoch(repo)
      const first = await harnessEpoch(tree)
      assert.notEqual(first, main)
      await git(['worktree', 'remove', '--force', tree])
      await git(['worktree', 'add', '-q', tree, 'changeset/one'])
      assert.notEqual(await harnessEpoch(tree), first)
    } finally {
      await rm(tree, { recursive: true, force: true })
    }
  })

  test('a file that holds something else throws instead of starting a new session', async () => {
    const repo = await throwawayRepo()
    await harnessEpoch(repo)
    await writeFile(join(repo, '.git', 'pikku-harness', 'epoch'), '../../x\n')
    await assert.rejects(harnessEpoch(repo), /does not hold an epoch/)
  })
})
