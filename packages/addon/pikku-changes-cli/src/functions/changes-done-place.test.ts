import { describe, test } from 'node:test'
import assert from 'node:assert'
import { realpathSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import { localChangesRPC, recordChangesetBranch } from '../lib/changes-local.js'
import { addChangesetWorktree } from '../lib/changeset-worktree.js'
import { refuseOutsideChangeset } from './changes-done.function.js'
import { doneNotMerged } from './next.function.js'

const ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=t']

describe('changes done runs where the change was built', () => {
  test('refuses the main checkout with the worktree sha, and passes in the worktree', async () => {
    const dir = realpathSync(await mkdtemp(join(tmpdir(), 'done-place-')))
    await git(['init', '-q', '-b', 'main'], dir)
    await writeFile(join(dir, 'pikku.config.json'), '{}\n')
    await git(['add', '.'], dir)
    await git([...ID, 'commit', '-q', '-m', 'init'], dir)
    const rpc = localChangesRPC(join(dir, '.git', 'q.json'))
    await rpc.invoke('createChange', { stageId: 'local', title: 'Add login' })
    await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1'],
      title: 'Add login',
      claimedBy: 'me',
    })
    const tree = await addChangesetWorktree('Add login', { cwd: dir })
    await writeFile(join(tree, 'login.ts'), 'export const login = 1\n')
    await git(['add', '.'], tree)
    await git([...ID, 'commit', '-q', '-m', '#1 Add login'], tree)
    const sha = (await git(['rev-parse', 'HEAD'], tree)).trim()

    await assert.rejects(
      refuseOutsideChangeset(rpc, 'local', '1', sha, dir),
      /is not HEAD of this checkout/
    )
    await assert.rejects(
      refuseOutsideChangeset(rpc, 'local', '1', undefined, dir),
      new RegExp(
        `changeset/add-login, and this checkout is on main[\\s\\S]*cd ${tree}`
      )
    )
    await refuseOutsideChangeset(rpc, 'local', '1', sha, tree)
    await refuseOutsideChangeset(rpc, 'local', '1', undefined, tree)
  })

  test('a changeset claimed again with another --title is still found by its group: done from main is refused, and its dependents wait', async () => {
    const dir = realpathSync(await mkdtemp(join(tmpdir(), 'done-place-')))
    await git(['init', '-q', '-b', 'main'], dir)
    await writeFile(join(dir, 'pikku.config.json'), '{}\n')
    await git(['add', '.'], dir)
    await git([...ID, 'commit', '-q', '-m', 'init'], dir)
    const path = join(dir, '.git', 'q.json')
    const rpc = localChangesRPC(path)
    await rpc.invoke('createChange', { stageId: 'local', title: 'Add login' })
    const { group } = await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1'],
      title: 'Add login',
      claimedBy: 'me',
    })
    const tree = await addChangesetWorktree('Add login', { cwd: dir })
    await recordChangesetBranch(path, group.groupId, 'changeset/add-login')
    // claimed again under a new title: the branch stays the one recorded
    const again = await rpc.invoke('claimChanges', {
      projectId: 'local',
      groupId: group.groupId,
      title: 'Login and logout',
      claimedBy: 'me',
    })
    assert.strictEqual(again.group.title, 'Login and logout')
    assert.strictEqual(
      (again.group as { branch?: string }).branch,
      'changeset/add-login'
    )
    assert.strictEqual(
      await addChangesetWorktree('Login and logout', {
        cwd: dir,
        reuse: true,
        branch: 'changeset/add-login',
      }),
      tree
    )
    await writeFile(join(tree, 'login.ts'), 'export const login = 1\n')
    await git(['add', '.'], tree)
    await git([...ID, 'commit', '-q', '-m', '#1 Add login'], tree)
    await assert.rejects(
      refuseOutsideChangeset(rpc, 'local', '1', undefined, dir),
      /changeset\/add-login, and this checkout is on main/
    )
    await refuseOutsideChangeset(rpc, 'local', '1', undefined, tree)

    // a done recorded from main (its sha already in main) does not unblock a
    // dependent while the changeset's branch is not merged
    const mainSha = (await git(['rev-parse', 'HEAD'], dir)).trim()
    await rpc.invoke('completeChange', {
      projectId: 'local',
      changeId: '1',
      branch: 'main',
      headCommit: mainSha,
    })
    const { changes, groups } = await rpc.invoke('listChanges', {
      projectId: 'local',
      includeDone: true,
    })
    assert.ok((await doneNotMerged(dir, changes, groups as never)).size === 1)
    await git(
      [...ID, 'merge', '-q', '--no-ff', 'changeset/add-login', '-m', 'm'],
      dir
    )
    assert.ok((await doneNotMerged(dir, changes, groups as never)).size === 0)
  })

  test('a changeset with no recorded branch, renamed by a later --title, is found by the commit carrying its change', async () => {
    const dir = realpathSync(await mkdtemp(join(tmpdir(), 'done-place-')))
    await git(['init', '-q', '-b', 'main'], dir)
    await writeFile(join(dir, 'pikku.config.json'), '{}\n')
    await git(['add', '.'], dir)
    await git([...ID, 'commit', '-q', '-m', 'init'], dir)
    const rpc = localChangesRPC(join(dir, '.git', 'q.json'))
    const { change } = await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Add login',
    })
    const { group } = await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1'],
      title: 'Add login',
      claimedBy: 'me',
    })
    const tree = await addChangesetWorktree('Add login', { cwd: dir })
    await writeFile(join(tree, 'login.ts'), 'export const login = 1\n')
    await git(['add', '.'], tree)
    await git(
      [
        ...ID,
        'commit',
        '-q',
        '-m',
        '#1 Add login',
        '-m',
        `Change-Id: ${change.changeId}`,
      ],
      tree
    )
    await rpc.invoke('claimChanges', {
      projectId: 'local',
      groupId: group.groupId,
      title: 'Something else',
      claimedBy: 'me',
    })
    await assert.rejects(
      refuseOutsideChangeset(rpc, 'local', '1', undefined, dir),
      /changeset\/add-login, and this checkout is on main/
    )
  })

  test('a change outside any changeset is judged where it is', async () => {
    const dir = realpathSync(await mkdtemp(join(tmpdir(), 'done-place-')))
    await git(['init', '-q', '-b', 'main'], dir)
    await writeFile(join(dir, 'a.ts'), '1\n')
    await git(['add', '.'], dir)
    await git([...ID, 'commit', '-q', '-m', 'init'], dir)
    const rpc = localChangesRPC(join(dir, '.git', 'q.json'))
    await rpc.invoke('createChange', { stageId: 'local', title: 'Tweak' })
    await refuseOutsideChangeset(rpc, 'local', '1', 'HEAD', dir)
    await assert.rejects(
      refuseOutsideChangeset(rpc, 'local', '1', 'deadbeef', dir),
      /is not HEAD/
    )
  })
})
