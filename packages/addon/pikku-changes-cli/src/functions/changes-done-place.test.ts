import { describe, test } from 'node:test'
import assert from 'node:assert'
import { realpathSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import { localChangesRPC } from '../lib/changes-local.js'
import { addChangesetWorktree } from '../lib/changeset-worktree.js'
import { refuseOutsideChangeset } from './changes-done.function.js'

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
