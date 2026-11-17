import { describe, test } from 'node:test'
import assert from 'node:assert'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import {
  addChangesetWorktree,
  assertWorktreeRoom,
  changesetWorktrees,
  maxChangesetWorktrees,
} from './changeset-worktree.js'
import { mergeChangeset } from './changeset-merge.js'
import { localChangesRPC, releaseChangeset } from './changes-local.js'
import { claimable } from './changes-next.js'
import { board } from './changes-board.js'

const ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=t']

const repo = async () => {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'pikku-wt-')))
  await git(['init', '-q', '-b', 'main'], dir)
  await writeFile(join(dir, '.gitignore'), 'node_modules/\ndist/\n.pikku/\n')
  await git(['add', '.gitignore'], dir)
  await git([...ID, 'commit', '-q', '-m', 'init'], dir)
  return dir
}

describe('changeset worktrees', () => {
  test('the cap is 3 unless PIKKU_CHANGES_MAX_WORKTREES says otherwise', () => {
    assert.strictEqual(maxChangesetWorktrees({}), 3)
    assert.strictEqual(
      maxChangesetWorktrees({ PIKKU_CHANGES_MAX_WORKTREES: '5' }),
      5
    )
    assert.strictEqual(
      maxChangesetWorktrees({ PIKKU_CHANGES_MAX_WORKTREES: 'x' }),
      3
    )
  })

  test('a fourth worktree is refused while three are live, naming them', async () => {
    const dir = await repo()
    for (const title of ['One', 'Two', 'Three'])
      await addChangesetWorktree(title, { cwd: dir }, 3)
    assert.strictEqual((await changesetWorktrees(dir)).length, 3)
    await assert.rejects(
      addChangesetWorktree('Four', { cwd: dir }, 3),
      (e: Error) =>
        /3 changeset worktrees are live and the cap is 3: changeset\/one, changeset\/three, changeset\/two/.test(
          e.message
        )
    )
    await assert.rejects(assertWorktreeRoom(dir, 3), /cap is 3/)
    assert.ok(!existsSync(join(`${dir}-changesets`, 'four')))
  })

  test('the worktrees sit beside the repo, also when claimed from inside one', async () => {
    const dir = await repo()
    const one = await addChangesetWorktree('One', { cwd: dir })
    assert.strictEqual(one, join(`${dir}-changesets`, 'one'))
    const two = await addChangesetWorktree('Two', { cwd: one })
    assert.strictEqual(two, join(`${dir}-changesets`, 'two'))
  })

  test('picking a changeset up again gets its worktree back, without counting against the cap', async () => {
    const dir = await repo()
    const one = await addChangesetWorktree('One', { cwd: dir }, 1)
    await writeFile(join(one, 'half-done.txt'), 'kept')
    assert.strictEqual(
      await addChangesetWorktree('One', { cwd: dir, reuse: true }, 1),
      one
    )
    assert.ok(existsSync(join(one, 'half-done.txt')))
  })

  test('a new changeset whose branch exists is refused, not handed that checkout', async () => {
    const dir = await repo()
    await addChangesetWorktree('One', { cwd: dir })
    await assert.rejects(
      addChangesetWorktree('One', { cwd: dir }),
      /changeset\/one already exists/
    )
  })

  test('a branch whose worktree was removed is checked out again on re-pickup', async () => {
    const dir = await repo()
    const one = await addChangesetWorktree('One', { cwd: dir })
    await git([...ID, 'commit', '-q', '--allow-empty', '-m', 'work'], one)
    await git(['worktree', 'remove', one], dir)
    const again = await addChangesetWorktree('One', { cwd: dir, reuse: true })
    assert.strictEqual(
      (await git(['log', '-1', '--format=%s'], again)).trim(),
      'work'
    )
  })
})

describe('merging a changeset built in a worktree', () => {
  test('removes the directory with its ignored files and the branch, and says how much it freed', async () => {
    const dir = await repo()
    const tree = await addChangesetWorktree('Add login', { cwd: dir })
    await writeFile(join(tree, 'login.ts'), 'export const login = 1\n')
    await git(['add', 'login.ts'], tree)
    await git([...ID, 'commit', '-q', '-m', '#1 Add login'], tree)
    // What a build leaves behind: ignored, so never committed and never merged.
    await mkdir(join(tree, 'node_modules', 'big'), { recursive: true })
    await writeFile(
      join(tree, 'node_modules', 'big', 'blob'),
      Buffer.alloc(200_000)
    )
    await mkdir(join(tree, '.pikku'), { recursive: true })
    await writeFile(join(tree, '.pikku', 'gen.ts'), 'x')
    await writeFile(join(tree, 'stray.txt'), 'untracked')

    const cwd = process.cwd()
    process.chdir(dir)
    try {
      const store = join(dir, '.git', 'pikku-changes.json')
      const outcome = await mergeChangeset(
        {
          group: { groupId: 'g1', title: 'Add login' } as any,
          branch: 'changeset/add-login',
        },
        store
      )
      assert.strictEqual(outcome.kind, 'merged')
      if (outcome.kind !== 'merged') return
      assert.strictEqual(outcome.removedWorktree, tree)
      assert.ok(outcome.freedBytes >= 200_000, `freed ${outcome.freedBytes}`)
      assert.strictEqual(outcome.branchDeleted, true)
      assert.strictEqual(outcome.cleanupError, undefined)
    } finally {
      process.chdir(cwd)
    }
    assert.ok(!existsSync(tree))
    assert.deepStrictEqual(await changesetWorktrees(dir), [])
    assert.strictEqual(
      (await git(['branch', '--list', 'changeset/*'], dir)).trim(),
      ''
    )
    assert.ok(existsSync(join(dir, 'login.ts')))
    assert.match(await git(['log', '-1', '--format=%B'], dir), /Changeset: g1/)
  })
})

describe('merging a changeset that committed scratch output', () => {
  test('a compare report the branch committed does not stop the merge when the checkout holds one untracked', async () => {
    const dir = await repo()
    const tree = await addChangesetWorktree('Clone home', { cwd: dir })
    const report = join('artifacts', 'tmp', 'compare', 'app', 'report.json')
    await mkdir(join(tree, 'artifacts', 'tmp', 'compare', 'app'), {
      recursive: true,
    })
    await writeFile(join(tree, report), '{"branch":true}')
    await writeFile(join(tree, 'home.tsx'), 'export const home = 1\n')
    await git(['add', '.'], tree)
    await git([...ID, 'commit', '-q', '-m', '#1 Clone home'], tree)
    await mkdir(join(dir, 'artifacts', 'tmp', 'compare', 'app'), {
      recursive: true,
    })
    await writeFile(join(dir, report), '{"main":true}')
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      const outcome = await mergeChangeset(
        {
          group: { groupId: 'g1', title: 'Clone home' } as any,
          branch: 'changeset/clone-home',
        },
        undefined
      )
      assert.strictEqual(outcome.kind, 'merged')
    } finally {
      process.chdir(cwd)
    }
    assert.ok(existsSync(join(dir, 'home.tsx')))
  })

  test('another untracked file in the way is refused with its name', async () => {
    const dir = await repo()
    const tree = await addChangesetWorktree('Add page', { cwd: dir })
    await writeFile(join(tree, 'page.tsx'), 'export const page = 1\n')
    await git(['add', '.'], tree)
    await git([...ID, 'commit', '-q', '-m', '#1 Add page'], tree)
    await writeFile(join(dir, 'page.tsx'), 'mine')
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      await assert.rejects(
        mergeChangeset(
          {
            group: { groupId: 'g1', title: 'Add page' } as any,
            branch: 'changeset/add-page',
          },
          undefined
        ),
        /holds untracked, and not all of them are the same as the branch's \(page\.tsx\)/
      )
    } finally {
      process.chdir(cwd)
    }
  })

  test("untracked copies identical to the branch's (intake's capture) are deleted and the merge goes ahead; one that differs refuses and nothing is deleted", async () => {
    const dir = await repo()
    await writeFile(join(dir, 'pikku.config.json'), '{}\n')
    await git(['add', '.'], dir)
    await git([...ID, 'commit', '-q', '-m', 'config'], dir)
    const site = join('artifacts', 'references', 'example.com')
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255, 254, 10])
    const write = async (root: string, name: string, body: Buffer | string) => {
      await mkdir(join(root, site), { recursive: true })
      await writeFile(join(root, site, name), body)
    }
    // the branch commits the capture; main holds the same files untracked
    const tree = await addChangesetWorktree('Capture', { cwd: dir })
    await write(tree, 'index-1440.png', png)
    await write(tree, 'index.json', '{"url":"https://example.com/"}')
    await git(['add', '.'], tree)
    await git([...ID, 'commit', '-q', '-m', '#1 Capture'], tree)
    await write(dir, 'index-1440.png', png)
    await write(dir, 'index.json', '{"url":"https://example.com/"}')
    // a second branch whose copy differs from what main holds
    const other = await addChangesetWorktree('Other capture', { cwd: dir })
    await mkdir(join(other, 'notes'), { recursive: true })
    await writeFile(join(other, 'notes', 'a.md'), 'same')
    await writeFile(join(other, 'notes', 'b.md'), 'branch')
    await git(['add', '.'], other)
    await git([...ID, 'commit', '-q', '-m', '#2 Notes'], other)
    await mkdir(join(dir, 'notes'), { recursive: true })
    await writeFile(join(dir, 'notes', 'a.md'), 'same')
    await writeFile(join(dir, 'notes', 'b.md'), 'checkout')
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      const outcome = await mergeChangeset(
        {
          group: { groupId: 'g1', title: 'Capture' } as any,
          branch: 'changeset/capture',
        },
        undefined
      )
      assert.strictEqual(outcome.kind, 'merged')
      assert.strictEqual(
        (await git(['status', '--porcelain', '--', site], dir)).trim(),
        ''
      )
      await assert.rejects(
        mergeChangeset(
          {
            group: { groupId: 'g2', title: 'Other capture' } as any,
            branch: 'changeset/other-capture',
          },
          undefined
        ),
        /not all of them are the same as the branch's \(notes\/a\.md, notes\/b\.md\)/
      )
      assert.ok(existsSync(join(dir, 'notes', 'a.md')))
    } finally {
      process.chdir(cwd)
    }
  })
})

describe('releasing a lease', () => {
  test('makes the change claimable at once, and the group can be claimed again', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'changes-')), 'q.json')
    const rpc = localChangesRPC(path)
    await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    const { group } = await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1'],
      claimedBy: 'builder-1',
      leaseMinutes: 30,
    })
    await rpc.invoke('moveChange', { changeId: '1', to: 'in_progress' })
    const list = async () =>
      board(
        await rpc.invoke('listChanges', {
          projectId: 'local',
          includeDone: true,
        })
      )
    assert.deepStrictEqual(claimable(await list(), Date.now()), [])
    await assert.rejects(
      rpc.invoke('claimChanges', {
        projectId: 'local',
        changeIds: ['1'],
        claimedBy: 'builder-2',
      }),
      /Already taken/
    )

    await releaseChangeset(path, group.groupId)

    assert.deepStrictEqual(
      claimable(await list(), Date.now() + 1).map((c) => c.shortId),
      ['1']
    )
    const again = await rpc.invoke('claimChanges', {
      projectId: 'local',
      groupId: group.groupId,
      changeIds: ['1'],
      claimedBy: 'builder-2',
    })
    assert.strictEqual(again.group.groupId, group.groupId)
    assert.strictEqual(again.group.title, 'A')
    assert.strictEqual(again.changes[0]!.status, 'in_progress')
  })
})
