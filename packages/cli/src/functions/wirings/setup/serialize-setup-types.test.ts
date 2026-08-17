import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeSetupTypes } from './serialize-setup-types.js'

const emit = (configTypeName?: string) =>
  serializeSetupTypes(
    '../function/pikku-function-types.gen.js',
    configTypeName
      ? `import type { ${configTypeName} } from '../../src/application-types.js'`
      : '// Config type not found, will use fallback',
    configTypeName,
    "import type { RequiredSingletonServices, RequiredWireServices } from '../pikku-services.gen.js'"
  )

describe('serializeSetupTypes', () => {
  // These three are declared once, by bootstrap, and never touched again —
  // unlike everything on `#pikku/function`, which a feature imports daily.
  // Keeping them together is what lets the function leaf read as "how do I
  // write a function" rather than as a mix of the two.
  test('carries the factories an application declares exactly once', () => {
    const content = emit('Config')

    for (const name of ['pikkuConfig', 'pikkuServices', 'pikkuWireServices']) {
      assert.match(content, new RegExp(`export const ${name}\\b`))
    }
  })

  // `Config` moved here with `pikkuConfig`: the factory's return type is the
  // one place it is needed, so importing it from the function leaf meant that
  // leaf carried a type nothing on it referenced.
  test('re-exports the project Config alongside pikkuConfig', () => {
    assert.match(emit('Config'), /export type \{ Config \}/)
  })

  test('falls back to an open Config when the project declares none', () => {
    assert.match(emit(), /export type Config = any/)
  })

  test('registers the wire services factory on pikku state', () => {
    assert.match(
      emit('Config'),
      /__pikkuState\(null, 'package', 'factories', \{ \.\.\.factories, createWireServices: func as any \}\)/
    )
  })
})
