import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeAnalytics } from './serialize-analytics.js'
import { analyticsSpecifier } from './pikku-command-analytics.js'

const leaf = (name: string) => `#pikku/${name}`

const parseErrors = (fileName: string, source: string) => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

describe('serializeAnalytics', () => {
  test('emits syntactically valid TypeScript for both files', () => {
    const { schemas, functions } = serializeAnalytics(
      leaf,
      './analytics.js',
      'analytics'
    )
    assert.deepEqual(parseErrors('analytics.schemas.gen.ts', schemas), [])
    assert.deepEqual(parseErrors('analytics.gen.ts', functions), [])
  })

  test('imports the declaration by the name it is exported under', () => {
    const { schemas } = serializeAnalytics(leaf, '../../telemetry.js', 'usage')
    assert.match(schemas, /import \{ usage \} from '\.\.\/\.\.\/telemetry\.js'/)
    // The union is read off the declaration rather than imported separately —
    // one export is the whole contract.
    assert.match(schemas, /event: usage\.events/)
  })

  test('caps a batch so one unauthed request cannot ask for unbounded work', () => {
    const { schemas } = serializeAnalytics(leaf, './analytics.js', 'analytics')
    assert.match(schemas, /\.min\(1\)/)
    assert.match(schemas, /\.max\(50\)/)
  })

  test('stamps identity from the session and never from the body', () => {
    const { functions } = serializeAnalytics(
      leaf,
      './analytics.js',
      'analytics'
    )
    assert.match(functions, /userId: session\?\.userId \?\? null/)
    // The wire schema is the only thing the body is read through, and it
    // declares no identity field — so there is nothing to spoof.
    const { schemas } = serializeAnalytics(leaf, './analytics.js', 'analytics')
    assert.equal(/userId/.test(schemas), false)
  })

  test('leaves the route unauthed and emits no middleware of its own', () => {
    const { functions } = serializeAnalytics(
      leaf,
      './analytics.js',
      'analytics'
    )
    assert.match(functions, /auth: false/)
    assert.equal(/middleware:/.test(functions), false)
  })

  test('honours the global HTTP prefix', () => {
    const { functions } = serializeAnalytics(
      leaf,
      './analytics.js',
      'analytics',
      '/api'
    )
    assert.match(functions, /route: '\/api\/analytics'/)
  })

  test('defaults to an unprefixed route', () => {
    const { functions } = serializeAnalytics(
      leaf,
      './analytics.js',
      'analytics'
    )
    assert.match(functions, /route: '\/analytics'/)
  })
})

describe('analyticsSpecifier', () => {
  test('is relative to the generated file and rewritten to .js', () => {
    assert.equal(
      analyticsSpecifier(
        '/p/src/scaffold/analytics/analytics.gen.ts',
        '/p/src/analytics.ts'
      ),
      '../../analytics.js'
    )
  })

  test('prefixes a sibling with ./ so it is not read as a bare module id', () => {
    assert.equal(
      analyticsSpecifier('/p/src/analytics.gen.ts', '/p/src/telemetry.ts'),
      './telemetry.js'
    )
  })

  test('rewrites a .tsx declaration too', () => {
    assert.equal(
      analyticsSpecifier('/p/src/analytics.gen.ts', '/p/src/telemetry.tsx'),
      './telemetry.js'
    )
  })
})
