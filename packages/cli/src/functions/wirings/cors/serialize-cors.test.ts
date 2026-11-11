import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import {
  DEFAULT_CORS_DEV_PORT,
  resolveCorsDevPort,
  serializeAnalyticsOrigin,
  serializeCors,
  serializeCorsOrigins,
} from './serialize-cors.js'

const leaf = (name: string) => `../../.pikku/${name}/index.js`

/** Run the generated helper module with its imports stubbed out. */
const loadOrigins = (source: string) => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const defined: Record<string, unknown>[] = []
  const exports: Record<string, any> = {}
  const stubs: Record<string, unknown> = {
    '@pikku/core/variable': { defineVariable: (v: never) => defined.push(v) },
    zod: { z: { string: () => ({ kind: 'string' }) } },
  }
  runInNewContext(outputText, { exports, require: (id: string) => stubs[id] })
  return { exports, defined }
}

const variables = (value?: string) => ({ get: async () => value })

/** Copies the result into this realm, since the module ran in a vm context. */
const originsOf = async (
  mod: { allowedOrigins: (v: unknown) => Promise<string[]> },
  value?: string
) => [...(await mod.allowedOrigins(variables(value)))]

describe('resolveCorsDevPort', () => {
  test('an explicit port wins', () => {
    assert.equal(resolveCorsDevPort(4200, { app: { dev: { port: 1 } } }), 4200)
  })

  test('the primary frontend decides, not the first', () => {
    assert.equal(
      resolveCorsDevPort(undefined, {
        admin: { dev: { port: 7200 } },
        app: { primary: true, dev: { port: 7104 } },
      }),
      7104
    )
  })

  test('falls back to the first frontend with a dev block, then the default', () => {
    assert.equal(
      resolveCorsDevPort(undefined, { site: {}, app: { dev: { port: 5173 } } }),
      5173
    )
    assert.equal(
      resolveCorsDevPort(undefined, undefined),
      DEFAULT_CORS_DEV_PORT
    )
    assert.equal(DEFAULT_CORS_DEV_PORT, 7104)
  })
})

describe('serializeCorsOrigins', () => {
  const { exports, defined } = loadOrigins(serializeCorsOrigins(7104))

  test('declares CORS_ORIGINS as an optional variable with a named schema', () => {
    assert.equal(defined.length, 1)
    assert.equal(defined[0]!.variableId, 'CORS_ORIGINS')
    assert.equal(defined[0]!.optional, true)
    assert.ok(exports.CorsOriginsSchema, 'schema must be a named export')
  })

  test('contains no wiring, which PKU490 forbids beside a schema', () => {
    const source = serializeCorsOrigins(7104)
    assert.doesNotMatch(source, /addHTTPMiddleware|wireHTTP/)
  })

  test('never reads process.env, which Workers do not have', () => {
    assert.doesNotMatch(serializeCorsOrigins(7104), /process\.env/)
  })

  test('a configured list is split and trimmed', async () => {
    assert.deepEqual(
      await originsOf(
        exports,
        ' https://a.example.com , https://b.example.com,,'
      ),
      ['https://a.example.com', 'https://b.example.com']
    )
  })

  test('unset falls back to localhost and 127.0.0.1 on the dev port', async () => {
    assert.deepEqual(await originsOf(exports), [
      'http://localhost:7104',
      'http://127.0.0.1:7104',
    ])
    const other = loadOrigins(serializeCorsOrigins(5173))
    assert.deepEqual(await originsOf(other.exports, ''), [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ])
  })

  test('there is no FRONTEND_URL variable', () => {
    assert.doesNotMatch(serializeCorsOrigins(7104), /FRONTEND_URL/)
  })
})

describe('serializeCors', () => {
  const source = serializeCors(leaf, './cors-origins.gen.js')

  test('wires the middleware for every route', () => {
    assert.match(source, /addHTTPMiddleware\('\*', \[corsMiddleware\]\)/)
  })

  test('builds the origin list per request from the variables service', () => {
    assert.match(source, /origin: await allowedOrigins\(variables\)/)
    assert.match(source, /credentials: true/)
    assert.match(source, /from '\.\/cors-origins\.gen\.js'/)
  })

  test('takes the authoring helpers from the middleware leaf', () => {
    assert.match(
      source,
      /import \{ addHTTPMiddleware, cors, pikkuMiddleware \} from '\.\.\/\.\.\/\.pikku\/middleware\/index\.js'/
    )
  })

  test('declares no schema, which PKU490 forbids beside wiring', () => {
    assert.doesNotMatch(source, /from 'zod'|defineVariable/)
  })
})

describe('serializeAnalyticsOrigin', () => {
  const source = serializeAnalyticsOrigin(leaf, './cors-origins.gen.js')

  test('locks /analytics with requireOrigin over the shared allowlist', () => {
    assert.match(source, /addHTTPMiddleware\('\/analytics', \[/)
    assert.match(source, /requireOrigin\(\{/)
    assert.match(source, /allowedOrigins\(variables\)/)
    assert.match(source, /from '\.\/cors-origins\.gen\.js'/)
  })

  test('follows the global HTTP prefix the ingest route is mounted under', () => {
    assert.match(
      serializeAnalyticsOrigin(leaf, './x.js', '/api'),
      /addHTTPMiddleware\('\/api\/analytics'/
    )
  })

  test('declares no schema, which PKU490 forbids beside wiring', () => {
    assert.doesNotMatch(source, /from 'zod'|defineVariable/)
  })
})
