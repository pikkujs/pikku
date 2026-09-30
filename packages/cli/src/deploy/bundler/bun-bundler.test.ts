import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { BunBundler } from './bun-bundler.js'
import type { CompileInput, CompileResult } from './bundler.interface.js'

class TestBunBundler extends BunBundler {
  run(input: CompileInput): Promise<CompileResult> {
    return this.compile(input)
  }
}

const compileEntry = async (source: string, externals: string[]) => {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-bun-bundler-'))
  const entryPath = join(dir, 'entry.ts')
  const bundlePath = join(dir, 'bundle.js')
  await writeFile(entryPath, source, 'utf-8')
  await writeFile(
    join(dir, 'sqlite-extensions.gen.js'),
    `export const sqliteExtensions = { vec0: '/bundled/at/compile' }\n`,
    'utf-8'
  )
  const result = await new TestBunBundler().run({
    unitName: 'root',
    entryPath,
    bundlePath,
    projectDir: dir,
    platform: 'node',
    format: 'esm',
    externals,
    sourcemap: false,
    emitMetafile: false,
    deadPatterns: [],
    mangleIdentifiers: false,
  })
  return { result, bundle: await readFile(bundlePath, 'utf-8') }
}

describe('BunBundler externals', () => {
  test('a relative external is left as an import, not inlined', async () => {
    const { result, bundle } = await compileEntry(
      `import { sqliteExtensions } from './sqlite-extensions.gen.js'\nconsole.log(sqliteExtensions)\n`,
      ['./sqlite-extensions.gen.js']
    )

    assert.match(bundle, /["']\.\/sqlite-extensions\.gen\.js["']/)
    assert.doesNotMatch(bundle, /\/bundled\/at\/compile/)
    assert.deepEqual([...result.externalPackages], [])
  })

  test('a bare external is still captured as a package', async () => {
    const { result, bundle } = await compileEntry(
      `import vec from 'sqlite-vec'\nconsole.log(vec)\n`,
      ['sqlite-vec']
    )

    assert.match(bundle, /["']sqlite-vec["']/)
    assert.deepEqual([...result.externalPackages], ['sqlite-vec'])
  })
})
