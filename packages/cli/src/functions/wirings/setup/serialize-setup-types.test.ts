import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeSetupTypes } from './serialize-setup-types.js'

const emit = (
  configTypeName?: string,
  allowShadowedServices?: string[],
  options?: { addon?: boolean }
) =>
  serializeSetupTypes(
    '../function/pikku-function-types.gen.js',
    configTypeName
      ? `import type { ${configTypeName} } from '../../src/application-types.js'`
      : '// Config type not found, will use fallback',
    configTypeName,
    "import type { RequiredSingletonServices, RequiredWireServices } from '../pikku-services.gen.js'",
    allowShadowedServices,
    options
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

  test('warns when the factory shadows a service the host passed in', () => {
    const content = emit('Config')

    assert.match(
      content,
      /const shadowed = Object\.keys\(createdServices\)\.filter\(/
    )
    assert.match(content, /logger\?\.warn\?\.\(/)
    assert.match(content, /discarding what the host passed in/)
  })

  test('exempts nothing when the project opts none in', () => {
    // Typed, not inferred: an empty literal infers Set<never>, and the
    // `.has(name)` below is then a compile error in every project that opts none
    // in — which is every project by default.
    assert.match(
      emit('Config'),
      /const allowedToShadow = new Set<string>\(\[\]\)/
    )
  })

  test('exempts the services pikku.config.json opts in', () => {
    const content = emit('Config', ['kysely', 'secrets'])

    assert.match(
      content,
      /const allowedToShadow = new Set<string>\(\["kysely","secrets"\]\)/
    )
    assert.match(content, /!allowedToShadow\.has\(name\) &&/)
  })

  test('points at the config key as the way to silence the warning', () => {
    assert.match(
      emit('Config'),
      /allowShadowedServices\\` in pikku\.config\.json/
    )
  })

  test('registers the wire services factory on pikku state', () => {
    assert.match(
      emit('Config'),
      /__pikkuState\(null, 'package', 'factories', \{ \.\.\.factories, createWireServices: func as any \}\)/
    )
  })

  // The hooks are the fourth thing bootstrap declares once, and `pikku dev` and
  // `pikku serve` are what run them — so a project imports the definer from the
  // same barrel as the other three, typed to its own services.
  test('carries the server lifecycle for an application', () => {
    const content = emit('Config')

    assert.match(content, /export const pikkuServerLifecycle\b/)
    assert.match(
      content,
      /import \{ CreateWireServices, ServerLifecycle \} from '@pikku\/core\/types'/
    )
    assert.match(content, /ServerLifecycle<RequiredSingletonServices>/)
  })

  // An addon does not own a server, so a lifecycle exported from one would be
  // documented, importable, and never run.
  test('an addon has no lifecycle to declare', () => {
    const content = emit('Config', undefined, { addon: true })

    assert.doesNotMatch(content, /pikkuServerLifecycle/)
    assert.doesNotMatch(content, /ServerLifecycle/)
  })
})
