import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeAnalytics } from './serialize-analytics.js'
import { analyticsEventsSpecifier } from './pikku-command-analytics.js'

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
      './analytics-events.js'
    )
    assert.deepEqual(parseErrors('analytics.schemas.gen.ts', schemas), [])
    assert.deepEqual(parseErrors('analytics.gen.ts', functions), [])
  })

  test('imports the app event union from the specifier it is given', () => {
    const { schemas } = serializeAnalytics(leaf, '../../analytics-events.js')
    assert.match(
      schemas,
      /import \{ analyticsEvent \} from '\.\.\/\.\.\/analytics-events\.js'/
    )
  })

  test('caps a batch so one unauthed request cannot ask for unbounded work', () => {
    const { schemas } = serializeAnalytics(leaf, './analytics-events.js')
    assert.match(schemas, /\.min\(1\)/)
    assert.match(schemas, /\.max\(50\)/)
  })

  test('stamps identity from the session and never from the body', () => {
    const { functions } = serializeAnalytics(leaf, './analytics-events.js')
    assert.match(functions, /userId: session\?\.userId \?\? null/)
    // The wire schema is the only thing the body is read through, and it
    // declares no identity field — so there is nothing to spoof.
    const { schemas } = serializeAnalytics(leaf, './analytics-events.js')
    assert.equal(/userId/.test(schemas), false)
  })

  test('leaves the route unauthed and emits no middleware of its own', () => {
    const { functions } = serializeAnalytics(leaf, './analytics-events.js')
    assert.match(functions, /auth: false/)
    assert.equal(/middleware:/.test(functions), false)
  })

  test('honours the global HTTP prefix', () => {
    const { functions } = serializeAnalytics(
      leaf,
      './analytics-events.js',
      '/api'
    )
    assert.match(functions, /route: '\/api\/analytics'/)
  })

  test('defaults to an unprefixed route', () => {
    const { functions } = serializeAnalytics(leaf, './analytics-events.js')
    assert.match(functions, /route: '\/analytics'/)
  })
})

describe('analyticsEventsSpecifier', () => {
  test('is relative to the generated file and rewritten to .js', () => {
    assert.equal(
      analyticsEventsSpecifier(
        '/p/src/scaffold/analytics/analytics.gen.ts',
        '/p/src/analytics-events.ts'
      ),
      '../../analytics-events.js'
    )
  })

  test('prefixes a sibling with ./ so it is not read as a bare module id', () => {
    assert.equal(
      analyticsEventsSpecifier(
        '/p/src/analytics.gen.ts',
        '/p/src/analytics-events.ts'
      ),
      './analytics-events.js'
    )
  })

  test('rewrites a .tsx union too', () => {
    assert.equal(
      analyticsEventsSpecifier(
        '/p/src/analytics.gen.ts',
        '/p/src/analytics-events.tsx'
      ),
      './analytics-events.js'
    )
  })
})
