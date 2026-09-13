import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeFeatureFlagsScaffold } from './serialize-feature-flags-scaffold.js'

const leaf = (name: string) => `#pikku/${name}`

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'feature-flags.gen.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

describe('serializeFeatureFlagsScaffold', () => {
  test('emits syntactically valid TypeScript', () => {
    assert.deepEqual(parseErrors(serializeFeatureFlagsScaffold(leaf)), [])
  })

  test('types the response with the generated union', () => {
    const source = serializeFeatureFlagsScaffold(leaf)
    assert.match(
      source,
      /import \{ FEATURE_FLAGS, type FeatureFlagName \} from '#pikku\/scopes'/
    )
    assert.match(source, /Record<FeatureFlagName, boolean>/)
  })

  test('reads the session off the wire, never off the body', () => {
    const source = serializeFeatureFlagsScaffold(leaf)
    // A caller who could name a subject would be asking what someone else
    // sees, and overrides are keyed on exactly that.
    assert.match(source, /_data, \{ session \}/)
    assert.doesNotMatch(source, /resolveFlagsForClient\([^)]*_data/s)
  })

  test('answers anonymously', () => {
    // A signed-out visitor still renders a page. `capable` is false for
    // anything scope-gated, so the map is honest without a session.
    assert.match(serializeFeatureFlagsScaffold(leaf), /auth: false/)
  })

  test('honours the global HTTP prefix', () => {
    assert.match(
      serializeFeatureFlagsScaffold(leaf, '/api'),
      /route: '\/api\/feature-flags'/
    )
    assert.match(
      serializeFeatureFlagsScaffold(leaf),
      /route: '\/feature-flags'/
    )
  })
})
