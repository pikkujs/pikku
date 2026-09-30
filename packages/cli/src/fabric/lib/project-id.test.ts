import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isTreeCleanBesidesProjectId,
  readConfigProjectId,
  writeConfigProjectId,
} from './project-id.js'

const repo = async (config: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'project-id-'))
  const run = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  run('init', '-q')
  run('config', 'user.email', 't@t.t')
  run('config', 'user.name', 't')
  await writeFile(join(dir, 'pikku.config.json'), config)
  run('add', '.')
  run('commit', '-qm', 'init')
  return dir
}

describe('projectId in pikku.config.json', () => {
  test('reads it, and returns null without one', async () => {
    const dir = await repo('{\n  "srcDirectories": ["src"]\n}\n')
    assert.equal(await readConfigProjectId(dir), null)
    await writeConfigProjectId('p1', dir)
    assert.equal((await readConfigProjectId(dir))?.projectId, 'p1')
    await rm(dir, { recursive: true, force: true })
  })

  test('writing adds one line and keeps the formatting', async () => {
    const dir = await repo('{\n    "srcDirectories": ["src"]\n}\n')
    await writeConfigProjectId('p1', dir)
    assert.equal(
      await readFile(join(dir, 'pikku.config.json'), 'utf8'),
      '{\n    "fabric": { "projectId": "p1" },\n    "srcDirectories": ["src"]\n}\n'
    )
    await writeConfigProjectId('p2', dir)
    assert.equal((await readConfigProjectId(dir))?.projectId, 'p2')
    await rm(dir, { recursive: true, force: true })
  })

  test('an id-only change does not dirty the tree, any other does', async () => {
    const dir = await repo('{\n  "srcDirectories": ["src"]\n}\n')
    await writeConfigProjectId('p1', dir)
    assert.equal(await isTreeCleanBesidesProjectId(dir), true)
    await writeFile(join(dir, 'other.txt'), 'x')
    assert.equal(await isTreeCleanBesidesProjectId(dir), false)
    await rm(join(dir, 'other.txt'))
    await writeFile(
      join(dir, 'pikku.config.json'),
      '{\n  "fabric": { "projectId": "p1" },\n  "srcDirectories": ["lib"]\n}\n'
    )
    assert.equal(await isTreeCleanBesidesProjectId(dir), false)
    await rm(dir, { recursive: true, force: true })
  })
})

describe('an existing fabric block', () => {
  test('gets projectId added or replaced inside it', async () => {
    const dir = await repo('{\n  "fabric": {\n    "x": 1\n  },\n  "a": 2\n}\n')
    await writeConfigProjectId('p1', dir)
    assert.equal(
      await readFile(join(dir, 'pikku.config.json'), 'utf8'),
      '{\n  "fabric": {\n    "projectId": "p1",\n    "x": 1\n  },\n  "a": 2\n}\n'
    )
    await writeConfigProjectId('p2', dir)
    assert.equal((await readConfigProjectId(dir))?.projectId, 'p2')
    assert.equal(await isTreeCleanBesidesProjectId(dir), true)
    await rm(dir, { recursive: true, force: true })
  })
})
