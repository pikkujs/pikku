import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeOtlpRunsScaffold } from './serialize-otlp-runs-scaffold.js'

const leaf = (name: string) => `#pikku/${name}`

describe('serializeOtlpRunsScaffold', () => {
  const source = serializeOtlpRunsScaffold(leaf)

  test('emits syntactically valid TypeScript', () => {
    const file = ts.createSourceFile(
      'otlp-runs.gen.ts',
      source,
      ts.ScriptTarget.Latest,
      true
    )
    assert.deepEqual(
      (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
        .parseDiagnostics,
      []
    )
  })

  test('declares the scope, the functions and both routes in the project', () => {
    assert.match(source, /defineScope\(\{\n {2}pikku: \{/)
    assert.match(source, /otlp: \{[\s\S]*runs: \{/)
    assert.match(source, /export const pikkuOtlpRunsSnapshot = pikkuFunc\(/)
    assert.match(source, /pikkuSubscribeFunc<void, 'otlp\.runs'>/)
    assert.equal(source.match(/scopes: \['pikku:otlp:runs'\]/g)?.length, 2)
    assert.match(source, /route: '\/otlp\/runs\/snapshot'/)
    assert.match(source, /route: '\/otlp\/runs\/stream'/)
    assert.match(source, /sse: true/)
    assert.match(source, /auth: true/)
    assert.match(source, /middleware: \[otlpRunsLiveGate\]/)
  })

  test('reaches pikku through its leaves and the CLI through one public path', () => {
    for (const name of ['function', 'middleware', 'http', 'scopes'])
      assert.match(source, new RegExp(`from '#pikku/${name}'`))
    assert.match(source, /from '@pikku\/cli\/otlp-runs'/)
  })

  test('prefixes the routes with the global HTTP prefix', () => {
    assert.match(serializeOtlpRunsScaffold(leaf, '/api'), /basePath: '\/api'/)
  })
})
