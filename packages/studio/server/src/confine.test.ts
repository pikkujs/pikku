import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, test } from 'node:test'
import { confinedSpawn } from './confine.js'

const run = (script: string, root: string, home: string) =>
  new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = confinedSpawn('/bin/sh', ['-c', script], { root, home }, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr!.on('data', (d) => (stderr += d))
    child.on('close', (code) => resolve({ code, stderr }))
  })

const supported = process.platform === 'darwin'

describe('confinedSpawn', { skip: !supported }, () => {
  const setup = async () => {
    const base = await mkdtemp(join(tmpdir(), 'pikku-confine-'))
    const home = join(base, 'home')
    const root = join(home, 'worktree')
    const outside = join(home, 'secrets')
    await mkdir(root, { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'key'), 'hunter2')
    return { base, home, root, outside }
  }

  test('writes inside the worktree', async () => {
    const { home, root } = await setup()
    const { code } = await run(`echo hi > ${root}/note`, root, home)
    assert.equal(code, 0)
    assert.equal((await readFile(join(root, 'note'), 'utf8')).trim(), 'hi')
  })

  test('bun can write its install cache', async () => {
    const { home, root } = await setup()
    await mkdir(join(home, '.bun', 'install', 'cache'), { recursive: true })
    const { code } = await run(`echo x > ${home}/.bun/install/cache/tmp`, root, home)
    assert.equal(code, 0)
  })

  test('npm can write its cache', async () => {
    const { home, root } = await setup()
    await mkdir(join(home, '.npm'), { recursive: true })
    const { code } = await run(`echo x > ${home}/.npm/tmp`, root, home)
    assert.equal(code, 0)
  })

  test('cannot write outside the worktree', async () => {
    const { home, root, outside, base } = await setup()
    const { code } = await run(`echo x > ${outside}/planted`, root, home)
    assert.notEqual(code, 0)
    assert.equal(existsSync(join(outside, 'planted')), false)
    const sibling = await run(`echo x > ${base}/../planted-${Date.now()}`, root, home)
    assert.equal(sibling.code, 0, 'the temp dir stays writable for tools')
  })

  test('cannot read the rest of home', async () => {
    const { home, root, outside } = await setup()
    const { code } = await run(`cat ${outside}/key`, root, home)
    assert.notEqual(code, 0)
  })
})

describe('a confined worktree', { skip: !supported }, () => {
  test('commits inside it and cannot touch the checkout it came from', async () => {
    const { ensureWorktree, worktreeConfinement } = await import('./worktree.js')
    const base = await mkdtemp(join(tmpdir(), 'pikku-worktree-'))
    const repo = join(base, 'app')
    await mkdir(repo)
    await writeFile(join(repo, 'README.md'), 'app')
    const worktree = await ensureWorktree(repo, join(base, 'studio'), 'p1')
    const again = await ensureWorktree(repo, join(base, 'studio'), 'p1')
    assert.equal(again.path, worktree.path)
    const confinement = { ...worktreeConfinement(worktree), home: base }
    const sh = (script: string) =>
      new Promise<number | null>((resolve) =>
        confinedSpawn('/bin/sh', ['-c', script], confinement, { stdio: 'ignore' }).on('close', resolve)
      )
    assert.equal(
      await sh('echo more > README.md && git -c user.name=a -c user.email=a@a commit -qam edit'),
      0
    )
    assert.notEqual(await sh(`echo x > ${repo}/README.md`), 0)
    assert.equal(await readFile(join(repo, 'README.md'), 'utf8'), 'app')
  })
})
