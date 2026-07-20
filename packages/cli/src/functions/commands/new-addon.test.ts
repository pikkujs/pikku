import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import { resolveAddonDepProtocol } from './new-addon.js'

const created: string[] = []

async function makeTmp() {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-new-addon-'))
  created.push(dir)
  return dir
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

afterEach(async () => {
  while (created.length) {
    await rm(created.pop()!, { recursive: true, force: true })
  }
})

describe('resolveAddonDepProtocol', () => {
  test('uses the workspace protocol inside a yarn workspace', async () => {
    const root = await makeTmp()
    await writeJson(join(root, 'package.json'), {
      name: 'root',
      private: true,
      workspaces: ['packages/**'],
    })
    const target = join(root, 'packages', 'communication')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'workspace:*')
  })

  test('supports the object form of workspaces', async () => {
    const root = await makeTmp()
    await writeJson(join(root, 'package.json'), {
      name: 'root',
      private: true,
      workspaces: { packages: ['packages/*'] },
    })
    const target = join(root, 'packages')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'workspace:*')
  })

  test('falls back to file: when there is no workspace ancestor', async () => {
    const root = await makeTmp()
    const target = join(root, 'standalone')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'file:..')
  })

  test('ignores an ancestor package.json that declares no workspaces', async () => {
    const root = await makeTmp()
    await writeJson(join(root, 'package.json'), { name: 'not-a-workspace' })
    const target = join(root, 'nested')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'file:..')
  })

  test('tolerates unparseable package.json while walking up', async () => {
    const root = await makeTmp()
    await writeFile(join(root, 'package.json'), '{ not json', 'utf8')
    const target = join(root, 'nested')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'file:..')
  })
})
