import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { localChangesRPC } from '../lib/changes-local.js'
import { createGateWire } from './gate.js'
import { gitIn } from './git.js'
import { changeCommit, recordChangeDone, trailerGate } from './mark-done.js'
import { removeThrowaways, throwawayRepo } from './test-support.js'

after(removeThrowaways)

/** A repo on a changeset branch, with a change filed on its local queue. */
const setup = async () => {
  const repo = await throwawayRepo()
  const store = join(repo, '.git', 'pikku-changes.json')
  const rpc = localChangesRPC(store)
  const { change } = await rpc.invoke('createChange', {
    projectId: 'local',
    title: 'One',
  } as never)
  const git = gitIn(repo)
  await git(['checkout', '-q', '-b', 'changeset/1-one'])
  const item = { shortId: change.shortId, changeId: change.changeId }
  const commit = async (file: string, message: string[]) => {
    await writeFile(join(repo, file), 'x\n')
    await git(['add', file])
    await git(['commit', '-q', ...message.flatMap((m) => ['-m', m])])
    return (await git(['rev-parse', 'HEAD'])).trim()
  }
  return { repo, store, rpc, item, commit }
}

describe('recordChangeDone', () => {
  test('records the change done on the local queue with its branch and the commit carrying its trailer', async () => {
    const { repo, store, rpc, item, commit } = await setup()
    const sha = await commit('a.txt', [
      `feat: #${item.shortId} one`,
      `Change-Id: ${item.changeId}`,
    ])
    await commit('b.txt', ['chore: tidy, no trailer'])
    assert.deepEqual(
      await recordChangeDone({ worktree: repo, item, storePath: store }),
      {
        headCommit: sha,
        branch: 'changeset/1-one',
      }
    )
    const { change } = await rpc.invoke('getChange', {
      changeId: item.changeId,
    } as never)
    assert.equal(change.status, 'done')
    assert.equal(change.headCommit, sha)
    assert.equal(change.branch, 'changeset/1-one')
  })

  test('without a commit carrying the trailer nothing is recorded and it throws', async () => {
    const { repo, store, rpc, item, commit } = await setup()
    await commit('a.txt', [`feat: #${item.shortId} one`])
    await assert.rejects(
      recordChangeDone({ worktree: repo, item, storePath: store }),
      /No commit on this branch is #1/
    )
    const { change } = await rpc.invoke('getChange', {
      changeId: item.changeId,
    } as never)
    assert.notEqual(change.status, 'done')
  })
})

describe('trailerGate', () => {
  test('an item with no commit carrying its trailer since the base is a high finding; a commit with it passes', async () => {
    const { repo, item, commit } = await setup()
    const wire = createGateWire({
      worktree: repo,
      base: 'main',
      attempt: 1,
      changeId: item.changeId,
      scratch: join(repo, '.git'),
    })
    const gate = trailerGate([item])
    const [missing] = await gate.run(wire)
    assert.equal(missing?.severity, 'high')
    assert.equal(missing?.rule, 'harness/trailer')
    assert.match(missing!.message, new RegExp(`Change-Id: ${item.changeId}`))
    await commit('a.txt', [
      `feat: #${item.shortId}`,
      `Change-Id: ${item.changeId}`,
    ])
    assert.equal((await changeCommit(repo, item, ['main..HEAD'])) !== '', true)
    assert.deepEqual(await gate.run(wire), [])
  })
})
