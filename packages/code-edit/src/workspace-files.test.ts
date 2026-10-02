import assert from 'node:assert'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  WorkspaceFileNotFoundError,
  WorkspaceFilesService,
  WorkspacePathError,
} from './workspace-files.js'

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-files-'))
  await mkdir(join(root, 'src/lib'), { recursive: true })
  await mkdir(join(root, 'node_modules/x'), { recursive: true })
  await writeFile(join(root, 'README.md'), '# hi\n')
  await writeFile(join(root, 'src/index.ts'), 'export {}\n')
  await writeFile(join(root, 'src/blob.bin'), Buffer.from([1, 0, 2]))
  return root
}

describe('WorkspaceFilesService', () => {
  test('lists directories first and hides ignored names', async () => {
    const files = new WorkspaceFilesService(await workspace())
    assert.deepStrictEqual(await files.list('/'), [
      { name: 'src', path: 'src', type: 'directory' },
      { name: 'README.md', path: 'README.md', type: 'file' },
    ])
    assert.deepStrictEqual(
      (await files.list('src')).map((e) => e.path),
      ['src/lib', 'src/blob.bin', 'src/index.ts']
    )
  })

  test('a directory that does not exist yet lists as empty', async () => {
    const files = new WorkspaceFilesService(await workspace())
    assert.deepStrictEqual(await files.list('artifacts'), [])
  })

  test('reads text, flags binary and truncates large files', async () => {
    const root = await workspace()
    const files = new WorkspaceFilesService(root, { maxFileBytes: 3 })
    const text = await files.read('/README.md')
    assert.strictEqual(text.content, '# h')
    assert.strictEqual(text.truncated, true)
    const binary = await files.read('src/blob.bin')
    assert.strictEqual(binary.binary, true)
    assert.strictEqual(binary.content, '')
    await assert.rejects(files.read('src'), WorkspaceFileNotFoundError)
    await assert.rejects(files.read('nope.ts'), WorkspaceFileNotFoundError)
  })

  test('hides secrets and ignored paths from listing and reading', async () => {
    const root = await workspace()
    await writeFile(join(root, '.env'), 'KEY=x')
    await writeFile(join(root, '.env.local'), 'KEY=x')
    await writeFile(join(root, '.env.example'), 'KEY=')
    await writeFile(join(root, 'node_modules/x/index.js'), '')
    const files = new WorkspaceFilesService(root)
    assert.deepStrictEqual(
      (await files.list()).map((e) => e.name),
      ['src', '.env.example', 'README.md']
    )
    await assert.rejects(files.read('.env'), WorkspaceFileNotFoundError)
    await assert.rejects(files.read('.env.local'), WorkspaceFileNotFoundError)
    await assert.rejects(
      files.read('node_modules/x/index.js'),
      WorkspaceFileNotFoundError
    )
    assert.strictEqual((await files.read('.env.example')).content, 'KEY=')
  })

  test('writes text files and refuses secrets, ignored folders and directories', async () => {
    const root = await workspace()
    const files = new WorkspaceFilesService(root)
    assert.deepStrictEqual(await files.write('src/index.ts', 'export const a = 1\n'), {
      path: 'src/index.ts',
      size: 19,
    })
    assert.strictEqual((await files.read('src/index.ts')).content, 'export const a = 1\n')
    await files.write('src/new/file.md', '# new')
    assert.strictEqual((await files.read('src/new/file.md')).content, '# new')
    await assert.rejects(files.write('.env', 'K=1'), WorkspaceFileNotFoundError)
    await assert.rejects(files.write('node_modules/x/a.js', ''), WorkspaceFileNotFoundError)
    await assert.rejects(files.write('src', ''), WorkspaceFileNotFoundError)
    await assert.rejects(files.write('../escape.txt', ''), WorkspacePathError)
  })

  test('rejects paths that leave the workspace', async () => {
    const root = await workspace()
    const outside = await mkdtemp(join(tmpdir(), 'pikku-outside-'))
    await writeFile(join(outside, 'secret'), 'x')
    await symlink(outside, join(root, 'link'))
    const files = new WorkspaceFilesService(root)
    await assert.rejects(files.read('../../etc/passwd'), WorkspacePathError)
    await assert.rejects(files.list('src/../..'), WorkspacePathError)
    await assert.rejects(files.read('link/secret'), WorkspacePathError)
    await assert.rejects(files.list('.git'), WorkspacePathError)
  })
  test('paths lists every visible file without git', async () => {
    const root = await workspace()
    await writeFile(join(root, '.env'), 'SECRET=1\n')
    const files = new WorkspaceFilesService(root)
    assert.deepStrictEqual((await files.paths()).paths.sort(), [
      'README.md',
      'src/blob.bin',
      'src/index.ts',
    ])
  })
})
