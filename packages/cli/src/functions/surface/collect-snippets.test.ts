import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  collectSnippets,
  DuplicateSnippetError,
  UnclosedSnippetError,
} from './collect-snippets.js'

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-snippets-'))
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content, 'utf8')
  }
  return root
}

describe('collectSnippets', () => {
  test('takes the region between the start and end markers', async () => {
    const root = await project({
      'src/wirings/http.ts': [
        `import { wireHTTP } from '#pikku/http'`,
        '',
        '// @snippet start wire-http',
        'wireHTTP({',
        `  method: 'get',`,
        '})',
        '// @snippet end wire-http',
        '',
        'wireHTTP({})',
      ].join('\n'),
    })

    const snippets = await collectSnippets(root)

    assert.equal(
      snippets.get('wire-http'),
      ['wireHTTP({', `  method: 'get',`, '})'].join('\n')
    )
  })

  test('strips the indentation the surrounding code imposed', async () => {
    const root = await project({
      'src/a.ts': [
        'const setup = () => {',
        '  // @snippet start nested',
        '  addError(Locked, {',
        '    status: 423,',
        '  })',
        '  // @snippet end nested',
        '}',
      ].join('\n'),
    })

    const snippets = await collectSnippets(root)

    assert.equal(
      snippets.get('nested'),
      ['addError(Locked, {', '  status: 423,', '})'].join('\n')
    )
  })

  test('reads both templates into one map, so either can hold a region', async () => {
    const app = await project({
      'src/a.ts': '// @snippet start app-one\nconst a = 1\n// @snippet end app-one',
    })
    const addon = await project({
      'src/b.ts':
        '// @snippet start addon-one\nconst b = 2\n// @snippet end addon-one',
    })

    const snippets = new Map<string, string>()
    await collectSnippets(app, snippets)
    await collectSnippets(addon, snippets)

    assert.deepEqual([...snippets.keys()].sort(), ['addon-one', 'app-one'])
  })

  test('refuses a name two files both claim', async () => {
    const root = await project({
      'src/a.ts': '// @snippet start same\nconst a = 1\n// @snippet end same',
      'src/b.ts': '// @snippet start same\nconst b = 2\n// @snippet end same',
    })

    await assert.rejects(
      () => collectSnippets(root),
      (error: Error) => error instanceof DuplicateSnippetError
    )
  })

  test('refuses a region that never closes', async () => {
    const root = await project({
      'src/a.ts': '// @snippet start open\nconst a = 1',
    })

    await assert.rejects(
      () => collectSnippets(root),
      (error: Error) => error instanceof UnclosedSnippetError
    )
  })

  test('does not read the generated tree or node_modules', async () => {
    const root = await project({
      '.pikku/gen.ts':
        '// @snippet start generated\nconst a = 1\n// @snippet end generated',
      'node_modules/dep/index.ts':
        '// @snippet start vendored\nconst b = 2\n// @snippet end vendored',
    })

    assert.equal((await collectSnippets(root)).size, 0)
  })
})
