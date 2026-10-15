import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mocksToGlob, serializeMocksModule } from './serialize-mocks-module.js'

describe('serializeMocksModule', () => {
  const out = serializeMocksModule(
    '/repo/packages/sdk/src/pikku/mocks.gen.ts',
    './api.gen.js',
    '/repo/.mocks',
    [
      { namespace: 'studio', dir: '/repo/os/packages/addon-studio/.mocks' },
      {
        namespace: 'stripe',
        dir: '/repo/node_modules/@pikku/addon-stripe/.mocks',
      },
    ]
  )

  test("globs the app mocks and each addon's, relative to the generated file", () => {
    assert.match(out, /import \{ registerMocks \} from '\.\/api\.gen\.js'/)
    assert.match(
      out,
      /files: import\.meta\.glob\('\.\.\/\.\.\/\.\.\/\.\.\/\.mocks\/\*\/\*\.json', \{ import: 'default' \}\)/
    )
    assert.match(
      out,
      /namespace: "studio",\n\s+files: import\.meta\.glob\('\.\.\/\.\.\/\.\.\/\.\.\/os\/packages\/addon-studio\/\.mocks\/\*\/\*\.json'/
    )
  })

  test('an addon inside node_modules is globbed exhaustively, since vite skips node_modules otherwise', () => {
    assert.match(
      out,
      /node_modules\/@pikku\/addon-stripe\/\.mocks\/\*\/\*\.meta\.json', \{ eager: true, import: 'default', exhaustive: true \}/
    )
    assert.doesNotMatch(out.split('"stripe"')[0]!, /exhaustive/)
  })
})

describe('mocksToGlob', () => {
  test('a project with no mocks anywhere gets no mocks module, so it never needs vite types', () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-glob-'))
    try {
      const addons = [
        { namespace: 'a', dir: join(root, 'a', '.mocks') },
        { namespace: 'b', dir: join(root, 'b', '.mocks') },
      ]
      assert.strictEqual(mocksToGlob(join(root, '.mocks'), addons), undefined)
      mkdirSync(addons[1]!.dir, { recursive: true })
      assert.deepStrictEqual(mocksToGlob(join(root, '.mocks'), addons), {
        app: false,
        addons: [addons[1]],
      })
      mkdirSync(join(root, '.mocks'))
      assert.deepStrictEqual(mocksToGlob(join(root, '.mocks'), addons), {
        app: true,
        addons: [addons[1]],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('without app mocks only the addons are globbed', () => {
    const out = serializeMocksModule(
      '/r/s/mocks.gen.ts',
      './api.gen.js',
      '/r/.mocks',
      [{ namespace: 'x', dir: '/r/x/.mocks' }],
      false
    )
    assert.doesNotMatch(out, /'\.\.\/\.mocks/)
    assert.match(out, /namespace: "x"/)
  })
})
