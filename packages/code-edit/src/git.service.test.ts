import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { GitService, WorkspacePathError, runGit } from './git.service.js'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const identity = (cwd: string) => {
  git(cwd, 'config', 'user.name', 'Test')
  git(cwd, 'config', 'user.email', 'test@example.com')
}

const setup = () => {
  const remote = mkdtempSync(join(tmpdir(), 'pikku-git-remote-'))
  const root = mkdtempSync(join(tmpdir(), 'pikku-git-'))
  git(remote, 'init', '--bare', '-q', '-b', 'main')
  git(root, 'init', '-q', '-b', 'main')
  identity(root)
  git(root, 'remote', 'add', 'origin', remote)
  writeFileSync(join(root, 'README.md'), 'seed\n')
  git(root, 'add', 'README.md')
  git(root, 'commit', '-q', '-m', 'seed')
  return { root, remote }
}

const write = (root: string, path: string, body: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), body)
}

describe('runGit', () => {
  test('caps captured output and stops the command', async () => {
    const { root } = setup()
    write(root, 'big.txt', 'x'.repeat(100_000))
    const result = await runGit(
      root,
      ['diff', '--no-index', '/dev/null', 'big.txt'],
      {
        maxBytes: 1000,
      }
    )
    assert.strictEqual(result.truncated, true)
    assert.strictEqual(Buffer.byteLength(result.stdout), 1000)
  })
})

describe('GitService', () => {
  test('status reports each kind of change and the upstream', async () => {
    const { root } = setup()
    const service = new GitService(root)
    assert.strictEqual((await service.push()).pushed, true)
    write(root, 'README.md', 'changed\n')
    write(root, 'src/new.ts', 'export {}\n')
    write(root, 'staged.ts', 'x\n')
    git(root, 'add', 'staged.ts')
    const status = await service.status()
    assert.strictEqual(status.branch, 'main')
    assert.strictEqual(status.upstream, 'origin/main')
    assert.strictEqual(status.clean, false)
    assert.deepStrictEqual(status.files.map((f) => [f.path, f.status]).sort(), [
      ['README.md', 'modified'],
      ['src/new.ts', 'untracked'],
      ['staged.ts', 'staged'],
    ])
  })

  test('status of a workspace inside a larger repo is relative to the workspace', async () => {
    const { root } = setup()
    write(root, 'apps/web/page.tsx', 'x\n')
    write(root, 'other.ts', 'x\n')
    const service = new GitService(join(root, 'apps'))
    const status = await service.status()
    assert.deepStrictEqual(
      status.files.map((f) => f.path),
      ['web/page.tsx']
    )
    const commit = await service.commit({ message: 'web', paths: ['web'] })
    assert.deepStrictEqual(commit.paths, ['web/page.tsx'])
    assert.match((await service.diff({ ref: 'HEAD~1' })).diff, /page\.tsx/)
  })

  test('log lists commits newest first', async () => {
    const { root } = setup()
    write(root, 'a.ts', 'a\n')
    git(root, 'add', 'a.ts')
    git(root, 'commit', '-q', '-m', 'add a')
    const log = await new GitService(root).log({ limit: 5 })
    assert.deepStrictEqual(
      log.map((c) => c.subject),
      ['add a', 'seed']
    )
    assert.strictEqual(log[0].shortSha.length >= 7, true)
    assert.deepStrictEqual(
      (await new GitService(root).log({ path: 'a.ts' })).map((c) => c.subject),
      ['add a']
    )
  })

  test('log of a repo with no commits is empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-git-empty-'))
    git(root, 'init', '-q', '-b', 'main')
    assert.deepStrictEqual(await new GitService(root).log(), [])
  })

  test('diff covers tracked, staged and untracked changes', async () => {
    const { root } = setup()
    const service = new GitService(root)
    write(root, 'README.md', 'changed\n')
    write(root, 'new.ts', 'hello\n')
    assert.match((await service.diff()).diff, /\+changed/)
    assert.match((await service.diff({ path: 'new.ts' })).diff, /\+hello/)
    git(root, 'add', 'README.md')
    assert.match((await service.diff({ staged: true })).diff, /\+changed/)
    assert.match((await service.diff({ ref: 'HEAD' })).diff, /\+changed/)
    await assert.rejects(service.diff({ ref: '--output=/tmp/x' }))
  })

  test('commit takes only the named paths, even past a blanket stage', async () => {
    const { root } = setup()
    const service = new GitService(root)
    write(root, 'notes/a.md', 'a\n')
    write(root, 'src/b.ts', 'b\n')
    git(root, 'add', '-A')
    const result = await service.commit({ message: 'notes', paths: ['notes'] })
    assert.strictEqual(result.status, 'committed')
    assert.deepStrictEqual(result.paths, ['notes/a.md'])
    assert.match(git(root, 'status', '--porcelain'), /src\/b\.ts/)
  })

  test('commit stages deletions and is a noop on a clean scope', async () => {
    const { root } = setup()
    const service = new GitService(root)
    rmSync(join(root, 'README.md'))
    const result = await service.commit({ message: 'rm', paths: ['README.md'] })
    assert.deepStrictEqual(result.paths, ['README.md'])
    assert.strictEqual(git(root, 'status', '--porcelain'), '')
    const noop = await service.commit({
      message: 'again',
      paths: ['README.md'],
    })
    assert.strictEqual(noop.status, 'noop')
    await assert.rejects(service.commit({ message: 'x', paths: [] }))
    await assert.rejects(
      service.commit({ message: 'x', paths: ['../outside'] }),
      WorkspacePathError
    )
  })

  test('push sets the upstream, then reports a diverged remote', async () => {
    const { root, remote } = setup()
    const service = new GitService(root)
    assert.deepStrictEqual(await service.push(), {
      pushed: true,
      branch: 'main',
      remote: 'origin',
    })
    const other = mkdtempSync(join(tmpdir(), 'pikku-git-other-'))
    git(other, 'clone', '-q', remote, '.')
    identity(other)
    write(other, 'theirs.ts', 'x\n')
    git(other, 'add', '.')
    git(other, 'commit', '-q', '-m', 'theirs')
    git(other, 'push', '-q')
    write(root, 'mine.ts', 'x\n')
    await service.commit({ message: 'mine', paths: ['mine.ts'] })
    const push = await service.push()
    assert.strictEqual(push.pushed, false)
    assert.strictEqual(push.pushed === false && push.reason, 'non-fast-forward')
    const pull = await service.pull()
    assert.strictEqual('reason' in pull && pull.reason, 'diverged')
  })

  test('pull fast-forwards to the upstream', async () => {
    const { root, remote } = setup()
    const service = new GitService(root)
    assert.strictEqual((await service.pull()).updated, false)
    await service.push()
    const other = mkdtempSync(join(tmpdir(), 'pikku-git-other-'))
    git(other, 'clone', '-q', remote, '.')
    identity(other)
    write(other, 'theirs.ts', 'x\n')
    git(other, 'add', '.')
    git(other, 'commit', '-q', '-m', 'theirs')
    git(other, 'push', '-q')
    const pull = await service.pull()
    assert.strictEqual(pull.updated, true)
    assert.strictEqual(git(root, 'log', '-1', '--format=%s'), 'theirs')
    assert.strictEqual((await service.pull()).updated, false)
  })

  test('push without a remote says so', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-git-noremote-'))
    git(root, 'init', '-q', '-b', 'main')
    identity(root)
    write(root, 'a', 'a\n')
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', 'a')
    const push = await new GitService(root).push()
    assert.strictEqual(push.pushed === false && push.reason, 'no-remote')
  })
})
