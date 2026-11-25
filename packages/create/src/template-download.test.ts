import { strict as assert } from 'assert'
import { after, before, describe, test } from 'node:test'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import {
  downloadPopulatedTemplate,
  EmptyTemplateError,
  STARTER_TEMPLATE_REF,
  STARTER_TEMPLATE_SOURCE,
  withStagingDir,
} from './utils.js'

const packageDir = path.join(import.meta.dirname, '..')
const repoRoot = path.join(packageDir, '..', '..')

describe('template download', () => {
  let root: string

  before(() => {
    const parent = path.join(packageDir, '.tmp')
    fs.mkdirSync(parent, { recursive: true })
    root = fs.mkdtempSync(path.join(parent, 'template-download-'))
  })

  after(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  const writes = (files: string[]) => async (_source: string, dir: string) => {
    fs.mkdirSync(dir, { recursive: true })
    for (const file of files) {
      fs.writeFileSync(path.join(dir, file), '{}')
    }
  }

  test('accepts a template that has a package.json', async () => {
    await downloadPopulatedTemplate(
      'gh:org/repo#ref',
      path.join(root, 'populated'),
      writes(['package.json'])
    )
  })

  for (const [shape, files] of [
    ['an empty directory', []],
    ['files but no package.json', ['README.md']],
  ] as const) {
    test(`refuses ${shape}, naming the source, without retrying`, async () => {
      const download = writes([...files])
      let calls = 0

      await assert.rejects(
        downloadPopulatedTemplate(
          'gh:org/repo/submodule#main',
          path.join(root, shape),
          (source, dir) => {
            calls++
            return download(source, dir)
          },
          { delayMs: 0 }
        ),
        (error: Error) =>
          error instanceof EmptyTemplateError &&
          error.message.includes('gh:org/repo/submodule#main')
      )
      assert.equal(calls, 1)
    })
  }

  test('stages in a new directory inside the target and removes it', async () => {
    const target = path.join(root, 'staged')
    let stagingDir = ''

    await withStagingDir(target, async (dir) => {
      stagingDir = dir
      assert.equal(path.dirname(dir), target)
      assert.deepEqual(fs.readdirSync(dir), [])
    })

    assert.equal(fs.existsSync(stagingDir), false)
    assert.deepEqual(fs.readdirSync(target), [])
  })

  test('leaves no project directory behind when the download fails', async () => {
    const target = path.join(root, 'failed', 'nested', 'app')

    await assert.rejects(
      withStagingDir(target, (dir) =>
        downloadPopulatedTemplate('gh:org/repo#ref', dir, writes([]))
      ),
      EmptyTemplateError
    )

    assert.equal(fs.existsSync(path.join(root, 'failed')), false)
  })

  test('keeps a directory that was there before a failed download', async () => {
    const target = path.join(root, 'existing')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, 'keep.txt'), 'mine')

    await assert.rejects(
      withStagingDir(target, async () => {
        throw new Error('download failed')
      }),
      /download failed/
    )

    assert.deepEqual(fs.readdirSync(target), ['keep.txt'])
  })
})

describe('the starter template source', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()

  test('is the repository the submodule points to', () => {
    const url = git(
      'config',
      '--file',
      '.gitmodules',
      'submodule.recipes/starter-template.url'
    )
    assert.equal(
      url,
      `https://github.com/${STARTER_TEMPLATE_SOURCE.slice('gh:'.length)}.git`
    )
  })

  test('is pinned to the commit the submodule pins', () => {
    const [, type, commit] = git(
      'ls-tree',
      'HEAD',
      'recipes/starter-template'
    ).split(/\s+/)
    assert.equal(type, 'commit')
    assert.equal(STARTER_TEMPLATE_REF, commit)
  })
})
