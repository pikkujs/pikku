import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeMocksModule } from './serialize-mocks-module.js'

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
