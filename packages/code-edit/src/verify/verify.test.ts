import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseTscOutput } from './tsc.js'
import { tscFindings } from './tsc-rules.js'
import { datalessDetailRoutes, orphanedChildRoutes } from './route-checks.js'
import {
  asI18nMisuse,
  brokenMessageCatalogs,
  staleTableZod,
} from './source-checks.js'
import { codegenFindings } from './codegen.js'
import { readLastVerifyResult, runVerify } from './run-verify.js'
import { readVerifyProject } from './project.js'

const project = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-verify-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const explain = (output: string, scope: 'backend' | 'frontend') =>
  tscFindings(
    parseTscOutput(output, '/p', { maxMessageLength: Infinity }).diagnostics,
    scope,
    'typecheck'
  )

describe('tsc rules', () => {
  test('an unknown RPC name is named as such', () => {
    const [f] = explain(
      `/p/src/a.tsx(3,20): error TS2345: Argument of type '"listThings"' is not assignable to parameter of type 'keyof FlattenedRPCMap'.`,
      'frontend'
    )
    assert.equal(f!.id, 'unknown-rpc')
    assert.equal(f!.file, 'src/a.tsx')
    assert.equal(f!.line, 3)
    assert.equal(f!.code, 'TS2345')
  })

  test('a built path in `to` suggests the declared route', () => {
    const [f] = explain(
      `/p/src/a.tsx(9,5): error TS2820: Type '"/app/things/42"' is not assignable to type '"/app" | "/app/things/$thingId"'. Did you mean '"/app/things/$thingId"'?`,
      'frontend'
    )
    assert.equal(f!.id, 'link-built-path')
    assert.match(f!.hint!, /\/app\/things\/\$thingId/)
  })

  test('params on a static route', () => {
    const [f] = explain(
      `/p/src/a.tsx(9,5): error TS2353: Object literal may only specify known properties, and 'thingId' does not exist in type 'ParamsReducerFn<AnyRouter, "/app">'.`,
      'frontend'
    )
    assert.equal(f!.id, 'link-params-without-route')
  })

  test('a literal beside a message is an i18n-node finding, frontend only', () => {
    const line = `/p/src/a.tsx(4,7): error TS2322: Type 'string' is not assignable to type 'I18nNode'.`
    assert.equal(explain(line, 'frontend')[0]!.id, 'i18n-node')
    assert.equal(explain(line, 'backend')[0]!.id, 'typecheck')
  })

  test('a snake_case table name, across continuation lines', () => {
    const [f] = explain(
      `/p/src/f.ts(2,30): error TS2345: Argument of type '"product_size"' is not assignable to parameter of type\n  'TableExpressionOrList<DB, never>'.`,
      'backend'
    )
    assert.equal(f!.id, 'snake-case-table-name')
  })

  test('a function whose func and schema disagree', () => {
    const [f] = explain(
      `/p/src/f.ts(5,1): error TS2769: No overload matches this call.\n  Overload 1 of 2, '(config: PikkuFunctionConfig<...>)' gave the following error.`,
      'backend'
    )
    assert.equal(f!.id, 'function-schema-mismatch')
  })

  test('an unrecognised diagnostic stays a plain typecheck finding with no hint', () => {
    const [f] = explain(
      `/p/src/f.ts(1,1): error TS2304: Cannot find name 'x'.`,
      'backend'
    )
    assert.equal(f!.id, 'typecheck')
    assert.equal(f!.hint, undefined)
  })
})

describe('route checks', () => {
  test('a parent route with children and no Outlet is orphaned', () => {
    const root = project({
      'src/routes/app.classes.tsx': `import { ClassesPage } from '@/pages/Classes'\nexport const Route = { component: ClassesPage }`,
      'src/pages/Classes.tsx': 'export const ClassesPage = () => <div/>',
      'src/routes/app.classes.$classId.tsx': 'export const Route = {}',
    })
    assert.deepEqual(orphanedChildRoutes(join(root, 'src/routes')), [
      { parent: 'app.classes.tsx', children: ['app.classes.$classId.tsx'] },
    ])
  })

  test('an Outlet in the imported page counts', () => {
    const root = project({
      'src/routes/app.tsx': `import { Shell } from '@/components/Shell'\nexport const Route = { component: Shell }`,
      'src/components/Shell.tsx': 'export const Shell = () => <Outlet />',
      'src/routes/app.home.tsx': 'export const Route = {}',
    })
    assert.deepEqual(orphanedChildRoutes(join(root, 'src/routes')), [])
  })

  test('a detail route with no data call is dataless; one with a query is not', () => {
    const root = project({
      'src/routes/app.things.$id.tsx': `import { Thing } from '@/pages/Thing'\nexport const Route = { component: Thing }`,
      'src/pages/Thing.tsx': 'export const Thing = () => <h1>Thing</h1>',
      'src/routes/app.items.$id.tsx': `usePikkuQuery('getItem', { id })`,
      'src/routes/app.about.tsx': 'export const Route = {}',
    })
    assert.deepEqual(datalessDetailRoutes(join(root, 'src/routes')), [
      'app.things.$id.tsx',
    ])
  })
})

describe('source checks', () => {
  test('asI18n around a message or template literal, with its line', () => {
    const root = project({
      'src/a.tsx':
        'const a = asI18n(row.name)\nconst b = asI18n(m.title())\nconst c = asI18n(`${n} tasks`)',
    })
    assert.deepEqual(
      asI18nMisuse(root).map((h) => h.line),
      [2, 3]
    )
  })

  test('a catalog that does not parse', () => {
    const root = project({
      'messages/en.json': '{"a": "x" "b": "y"}',
      'messages/de.json': '{"a": "x"}',
    })
    const broken = brokenMessageCatalogs(root)
    assert.equal(broken.length, 1)
    assert.match(broken[0]!.file, /en\.json$/)
  })

  test('a table zod imported but not generated', () => {
    const root = project({
      '.pikku/db/zod.gen.ts': 'export const UsersZ = 1\n',
      'src/a.function.ts': `import { CakeOrdersZ, UsersZ } from '#pikku/db/zod.gen.js'`,
    })
    const stale = staleTableZod([join(root, 'src')], join(root, '.pikku'))
    assert.deepEqual(
      stale!.map((s) => [s.name, s.line]),
      [['CakeOrdersZ', 1]]
    )
  })

  test('no generated zod means codegen never ran, not that everything is stale', () => {
    const root = project({
      'src/a.function.ts': `import { CakeOrdersZ } from '#pikku/db/zod.gen.js'`,
    })
    assert.equal(staleTableZod([join(root, 'src')], join(root, '.pikku')), null)
  })
})

describe('codegen output', () => {
  test('coded diagnostics are deduplicated and located; notices and info are dropped', () => {
    const line = (o: object) => JSON.stringify(o)
    const output = [
      line({ level: 'info', message: 'Inspecting' }),
      line({
        level: 'warn',
        message: "Run 'pikku versions init' to enable contract versioning.",
      }),
      line({
        level: 'critical',
        code: 'PKU111',
        message:
          '[PKU111] Could not determine workflow name from export at src/flows/a.ts:12.\n  → https://pikku.dev/docs/pikku-cli/errors/pku111',
      }),
      line({
        level: 'critical',
        code: 'PKU111',
        message:
          '[PKU111] Could not determine workflow name from export at src/flows/a.ts:12.\n  → https://pikku.dev/docs/pikku-cli/errors/pku111',
      }),
      'not json',
    ].join('\n')
    const findings = codegenFindings(output)
    assert.equal(findings.length, 1)
    assert.deepEqual(
      {
        id: findings[0]!.id,
        file: findings[0]!.file,
        line: findings[0]!.line,
        severity: findings[0]!.severity,
      },
      { id: 'PKU111', file: 'src/flows/a.ts', line: 12, severity: 'error' }
    )
    assert.doesNotMatch(findings[0]!.message, /PKU111\]|→/)
  })

  test('a plain-text crash replaces the bare workflow-failed line', () => {
    const output = [
      JSON.stringify({
        level: 'error',
        message: 'Workflow allWorkflow (run 1) failed:',
      }),
      'Error: [PKU718] @pikku/cli requires @pikku/core@^0.12.136, but 0.12.123 is installed.',
      '    at assertCoreVersionInPeerRange (file:///x.js:1:1)',
    ].join('\n')
    const findings = codegenFindings(output)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'PKU718')
    assert.doesNotMatch(findings[0]!.message, /at assertCore/)
  })
})

describe('runVerify', () => {
  test('runs the static checks over discovered apps and records the result', async () => {
    const root = project({
      'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
      'pikku.config.json': JSON.stringify({ srcDirectories: ['src'] }),
      'apps/web/tsconfig.json': '{}',
      'apps/web/src/routes/app.tsx': 'export const Route = {}',
      'apps/web/src/routes/app.home.tsx': 'export const Route = {}',
    })
    assert.deepEqual(
      readVerifyProject(root).frontends.map((f) => f.name),
      ['web']
    )
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      frontends: false,
    })
    assert.equal(result.ok, false)
    assert.deepEqual(
      result.findings.map((f) => [f.id, f.file]),
      [['orphaned-child-route', 'apps/web/src/routes/app.tsx']]
    )
    assert.deepEqual(await readLastVerifyResult(root), result)
    assert.ok(readFileSync(join(root, '.pikku/verify/last-run.json'), 'utf8'))
  })

  test('declared frontends win over discovery and deploy:false is skipped', () => {
    const root = project({
      'pikku.config.json': JSON.stringify({
        frontends: {
          site: { cwd: 'web/site' },
          admin: { cwd: 'web/admin', deploy: false },
        },
      }),
      'web/site/tsconfig.json': '{}',
      'web/admin/tsconfig.json': '{}',
      'apps/other/tsconfig.json': '{}',
    })
    assert.deepEqual(
      readVerifyProject(root).frontends.map((f) => f.name),
      ['site']
    )
  })
})
