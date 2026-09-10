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

const declaration = (
  specifier = './analytics.js',
  variable = 'analyticsEvents',
  events = ['page_viewed']
) => ({ specifier, variable, events })

describe('serializeAnalytics', () => {
  test('emits syntactically valid TypeScript for both files', () => {
    const { schemas, functions } = serializeAnalytics(leaf, [declaration()])
    assert.deepEqual(parseErrors('analytics.schemas.gen.ts', schemas), [])
    assert.deepEqual(parseErrors('analytics.gen.ts', functions), [])
  })

  test('imports each declaration by the name it is exported under', () => {
    const { schemas } = serializeAnalytics(leaf, [
      declaration('../../telemetry.js', 'usage'),
    ])
    assert.match(
      schemas,
      /import \{ usage as events0 \} from '\.\.\/\.\.\/telemetry\.js'/
    )
  })

  // The name is the key in a declaration, so it is reattached as the
  // discriminator rather than repeated in every app-owned schema.
  test('rebuilds the discriminator from the declared keys', () => {
    const { schemas } = serializeAnalytics(leaf, [
      declaration('./analytics.js', 'analyticsEvents', [
        'page_viewed',
        'todo_created',
      ]),
    ])
    assert.match(schemas, /z\.discriminatedUnion\('name', \[/)
    assert.match(schemas, /name: z\.literal\('page_viewed'\)/)
    assert.match(schemas, /events0\['todo_created'\]\.shape/)
  })

  // A feature module declares its own events beside its own functions, so two
  // modules may both export `analyticsEvents` and must not collide.
  test('unions several declarations under distinct aliases', () => {
    const { schemas } = serializeAnalytics(leaf, [
      declaration('../../analytics.js', 'analyticsEvents', ['page_viewed']),
      declaration('../../billing.js', 'analyticsEvents', [
        'checkout_completed',
      ]),
    ])
    assert.match(schemas, /import \{ analyticsEvents as events0 \}/)
    assert.match(schemas, /import \{ analyticsEvents as events1 \}/)
    assert.match(schemas, /events0\['page_viewed'\]\.shape/)
    assert.match(schemas, /events1\['checkout_completed'\]\.shape/)
  })

  test('caps a batch so one unauthed request cannot ask for unbounded work', () => {
    const { schemas } = serializeAnalytics(leaf, [declaration()])
    assert.match(schemas, /\.min\(1\)/)
    assert.match(schemas, /\.max\(50\)/)
  })

  // Identity is stamped by the invocation handle, so the wire schema has no
  // identity field to spoof and the ingest passes none.
  test('never reads identity from the body', () => {
    const { schemas, functions } = serializeAnalytics(leaf, [declaration()])
    assert.equal(/userId/.test(schemas), false)
    assert.equal(/userId/.test(functions), false)
  })

  // What separates a relayed page view from an outcome a function recorded.
  test('relays a client event as client-sourced, with its own clock', () => {
    const { functions } = serializeAnalytics(leaf, [declaration()])
    assert.match(functions, /analyticsLog!\.record\(event, \{ at \}\)/)
  })

  test('leaves the route unauthed and emits no middleware of its own', () => {
    const { functions } = serializeAnalytics(leaf, [declaration()])
    assert.match(functions, /auth: false/)
    assert.equal(/middleware:/.test(functions), false)
  })

  test('honours the global HTTP prefix', () => {
    const { functions } = serializeAnalytics(leaf, [declaration()], '/api')
    assert.match(functions, /route: '\/api\/analytics'/)
  })

  test('defaults to an unprefixed route', () => {
    const { functions } = serializeAnalytics(leaf, [declaration()])
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
