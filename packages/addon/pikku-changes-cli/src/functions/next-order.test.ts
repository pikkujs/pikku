import { describe, test } from 'node:test'
import assert from 'node:assert'
import { realpathSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import { localChangesRPC } from '../lib/changes-local.js'
import { pick, route } from './next.function.js'

const ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=t']

describe('next --parallel with a dependency', () => {
  test('a change waits until the change it depends on is merged, not only done', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'next-order-')))
    await git(['init', '-q', '-b', 'main'], root)
    await writeFile(join(root, 'pikku.config.json'), '{}\n')
    await git(['add', '.'], root)
    await git([...ID, 'commit', '-q', '-m', 'init'], root)
    await git(['switch', '-q', '-c', 'changeset/data'], root)
    await writeFile(join(root, 'data.ts'), 'export const data = 1\n')
    await git(['add', '.'], root)
    await git([...ID, 'commit', '-q', '-m', '#1 Data'], root)
    const sha = (await git(['rev-parse', 'HEAD'], root)).trim()
    await git(['switch', '-q', 'main'], root)

    const rpc = localChangesRPC(join(root, '.git', 'q.json'))
    const { change: data } = await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Data tables',
      specialist: 'build',
    } as any)
    await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Home page',
      specialist: 'frontend',
      dependsOn: [data.changeId],
    } as any)
    await rpc.invoke('completeChange', {
      changeId: data.changeId,
      branch: 'changeset/data',
      headCommit: sha,
    } as any)

    const waiting = await pick(root, rpc, 'local', true)
    assert.strictEqual(waiting.agent, null)
    assert.match(waiting.reason, /waiting on another change/)
    // without --parallel a done change has been merged before pick runs
    assert.strictEqual((await pick(root, rpc, 'local', false)).agent, 'changes')

    await git(
      [...ID, 'merge', '-q', '--no-ff', 'changeset/data', '-m', 'merge'],
      root
    )
    const after = await pick(root, rpc, 'local', true)
    assert.strictEqual(after.agent, 'changes')
    assert.match(after.context ?? '', /Home page/)
  })
})

describe('next with merges held', () => {
  test('--no-merge and PIKKU_CHANGES_NO_MERGE=1 list the work without merging a finished changeset', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'next-hold-')))
    await git(['init', '-q', '-b', 'main'], root)
    await writeFile(join(root, 'pikku.config.json'), '{}\n')
    await git(['add', '.'], root)
    await git([...ID, 'commit', '-q', '-m', 'init'], root)
    await git(['switch', '-q', '-c', 'changeset/data'], root)
    await writeFile(join(root, 'data.ts'), 'export const data = 1\n')
    await git(['add', '.'], root)
    await git([...ID, 'commit', '-q', '-m', '#1 Data'], root)
    const sha = (await git(['rev-parse', 'HEAD'], root)).trim()
    await git(['switch', '-q', 'main'], root)
    const rpc = localChangesRPC(join(root, '.git', 'pikku-changes.json'))
    await rpc.invoke('createChange', { stageId: 'local', title: 'Data' })
    await rpc.invoke('createChange', { stageId: 'local', title: 'Other' })
    await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1'],
      claimedBy: 'me',
      leaseMinutes: 0,
    })
    await rpc.invoke('completeChange', {
      projectId: 'local',
      changeId: '1',
      branch: 'changeset/data',
      headCommit: sha,
    } as any)
    const home = process.cwd()
    const saved = process.env.PIKKU_CHANGES_DIR
    delete process.env.PIKKU_CHANGES_DIR
    process.chdir(root)
    try {
      const held = await route(root, { parallel: true, merge: false })
      assert.deepStrictEqual(held.merged, [])
      assert.strictEqual(held.agent, 'changes')
      assert.match(held.context ?? '', /Other/)
      process.env.PIKKU_CHANGES_NO_MERGE = '1'
      assert.deepStrictEqual((await route(root, { parallel: true })).merged, [])
      delete process.env.PIKKU_CHANGES_NO_MERGE
      const main = (await git(['rev-parse', 'main'], root)).trim()
      assert.notStrictEqual(main, sha)
      const merged = await route(root, { parallel: true })
      assert.strictEqual(merged.merged.length, 1)
      assert.match(merged.merged[0]!, /→ main/)
    } finally {
      delete process.env.PIKKU_CHANGES_NO_MERGE
      if (saved !== undefined) process.env.PIKKU_CHANGES_DIR = saved
      process.chdir(home)
    }
  })
})
