import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseTscOutput } from './tsc.js'
import { tscFindings } from './tsc-rules.js'
import { datalessDetailRoutes, orphanedChildRoutes } from './route-checks.js'
import {
  asI18nArguments,
  asI18nStubs,
  brokenMessageCatalogs,
  jsxLiteralProps,
  jsxLiteralText,
  sepArguments,
  staleTableZod,
  stringLiteralCopy,
} from './source-checks.js'
import { codegenFindings } from './codegen.js'
import {
  readLastVerifyResult,
  runStaticChecks,
  runVerify,
} from './run-verify.js'
import { readVerifyProject, workspacePackageDirs } from './project.js'

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
  test('asI18n arguments that are not a plain variable reference', () => {
    const root = project({
      'src/bad.ts': [
        "const a = asI18n('Projects')",
        'const b = asI18n(`Projects`)',
        'const c = asI18n(`${n} projects`)',
        "const d = asI18n('Hi ' + name)",
        "const e = asI18n(ok ? 'Yes' : 'No')",
        "const f = asI18n(name ?? 'Unknown')",
        'const g = asI18n(String(count))',
        'const h = asI18n(items[0])',
        "const i = asI18n('Hi' as string)",
      ].join('\n'),
    })
    assert.deepEqual(
      asI18nArguments(root).map((h) => [h.line, h.kind]),
      [
        [1, 'a string literal'],
        [2, 'a template literal'],
        [3, 'a template literal'],
        [4, 'a concatenation'],
        [5, 'an expression'],
        [6, 'an expression'],
        [7, 'a call'],
        [8, 'an expression'],
        [9, 'a string literal'],
      ]
    )
  })

  test('asI18n of a variable, member chain, optional chain, non-null or parenthesised reference is allowed', () => {
    const root = project({
      'src/ok.tsx': [
        'const a = asI18n(name)',
        'const b = asI18n(project.name)',
        'const c = asI18n(a.b.c)',
        'const d = asI18n(a?.b)',
        'const e = asI18n(x!)',
        'const f = asI18n((x))',
        'const g = asI18n(x as string)',
        'const h = asI18n(a!.b)',
        'export const J = () => <p>{asI18n(row.title)}</p>',
      ].join('\n'),
    })
    assert.deepEqual(asI18nArguments(root), [])
  })

  test('asI18n is recognised through a renamed import and a namespace, in .ts and .tsx', () => {
    const root = project({
      'src/a.ts': "import { asI18n as brand } from '@pikku/react'\nbrand('x')",
      'src/b.tsx': "import * as r from '@pikku/react'\nr.asI18n(`y`)",
    })
    assert.deepEqual(
      asI18nArguments(root)
        .map((h) => [h.file.split('/').pop(), h.line])
        .sort(),
      [
        ['a.ts', 2],
        ['b.tsx', 2],
      ]
    )
  })

  test('asI18nStub is not mistaken for asI18n, and asI18n literals still fail', () => {
    const root = project({
      'src/a.ts': [
        "import { asI18n, asI18nStub } from '@pikku/react'",
        "const a = asI18nStub('Maya Okafor')",
        "const b = asI18n('Projects')",
        "const c = asI18nStubby('x')",
        "const d = myasI18n('x')",
      ].join('\n'),
    })
    assert.deepEqual(
      asI18nArguments(root).map((h) => h.line),
      [3]
    )
  })

  test('asI18nStub calls are inventoried by name, alias and namespace', () => {
    const root = project({
      'src/a.ts': [
        "import { asI18nStub as stub } from '@pikku/react'",
        "const a = stub('Sunrise Bakery Classes')",
        "const b = stub('A very long made-up sentence that goes past the sixty character trim limit')",
        'const c = stub(`tpl`)',
        'const d = stub(name)',
      ].join('\n'),
      'src/b.tsx': "import * as r from '@pikku/react'\nr.asI18nStub('Maya')",
      'react/src/i18n-types.ts':
        "export const asI18nStub = (s: string) => s\nasI18nStub('x')",
      'src/own.ts': "const asI18nStub = (s: string) => s\nasI18nStub('x')",
      'src/a.test.ts': "asI18nStub('x')",
    })
    const hits = asI18nStubs(root)
      .map((h) => [h.file.split('/').pop(), h.line, h.copy])
      .sort(
        (a, b) =>
          String(a[0]).localeCompare(String(b[0])) ||
          Number(a[1]) - Number(b[1])
      )
    assert.deepEqual(hits, [
      ['a.ts', 2, 'Sunrise Bakery Classes'],
      [
        'a.ts',
        3,
        'A very long made-up sentence that goes past the sixty charac',
      ],
      ['a.ts', 4, 'tpl'],
      ['a.ts', 5, 'name'],
      ['b.tsx', 2, 'Maya'],
    ])
  })

  test('runVerify reports i18n-stub as a warning, and as an error in strict mode', async () => {
    const files = {
      'package.json': '{"workspaces":["packages/*"]}',
      'pikku.config.json': '{"i18n":{"ignore":["packages/console"]}}',
      'packages/ui/src/a.ts': ["asI18nStub('One')", "asI18nStub('Two')"].join(
        '\n'
      ),
      'packages/console/src/b.ts': "asI18nStub('Ignored')",
    }
    const run = async (strict: boolean) =>
      (
        await runVerify({
          rootDir: project(files),
          codegen: false,
          typecheck: false,
          record: false,
          strict,
        })
      ).findings
        .filter((f) => f.id === 'i18n-stub')
        .map((f) => [f.line, f.severity])
    assert.deepEqual(await run(false), [
      [1, 'warn'],
      [2, 'warn'],
    ])
    assert.deepEqual(await run(true), [
      [1, 'error'],
      [2, 'error'],
    ])
  })

  test('i18n-stub message names the file, line, and trimmed text', async () => {
    const root = project({
      'package.json': '{"workspaces":["packages/*"]}',
      'pikku.config.json': '{}',
      'packages/ui/src/a.ts': "asI18nStub('Maya Okafor')",
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      record: false,
    })
    const f = result.findings.find((x) => x.id === 'i18n-stub')!
    assert.equal(
      f.message,
      'packages/ui/src/a.ts:1 asI18nStub("Maya Okafor") — fixture text; productise before release'
    )
  })

  test('asI18n arguments are not checked in the definition, tests or stories', () => {
    const root = project({
      'react/src/i18n-types.ts':
        "export const asI18n = (s: string) => s\nasI18n('x')",
      'src/own.ts': "const asI18n = (s: string) => s\nasI18n('x')",
      'src/a.test.ts': "asI18n('x')",
      'src/a.spec.tsx': "asI18n('x')",
      'src/a.stories.tsx': "asI18n('x')",
    })
    assert.deepEqual(asI18nArguments(root), [])
  })

  test('sep-argument: only literals of whitespace, punctuation and symbols; binding must come from @pikku/react', () => {
    const root = project({
      'src/a.tsx': [
        "import { sep, sep as s2 } from '@pikku/react'",
        "sep(' · ')",
        "sep('and')",
        "sep('')",
        "sep('v2')",
        "sep('1.')",
        'sep(name)',
        'sep(`${x} / `)',
        'sep(`/`)',
        "s2('é')",
        "sep(' / ' as const)",
        "separate('and')",
        "asI18nSep('and')",
        "sepFoo('and')",
        "sep('→')",
        'sep()',
      ].join('\n'),
      'src/b.ts': "import * as r from '@pikku/react'\nr.sep('x')\nr.sep(' — ')",
      'src/other.ts': "import { sep } from 'node:path'\nsep('x')",
      'src/own.ts': "const sep = (s: string) => s\nsep('x')",
      'src/a.test.ts': "import { sep } from '@pikku/react'\nsep('x')",
      'src/c.stories.tsx': "import { sep } from '@pikku/react'\nsep('x')",
      'react/src/i18n-types.ts':
        "export const sep = (s: string) => s\nsep('x')",
      'react/src/other.ts': "import { sep } from './i18n-types.js'\nsep('x')",
    })
    const hits = sepArguments(root)
      .map((h) => [h.file.split('/').pop(), h.line, h.reason])
      .sort(
        (a, b) =>
          String(a[0]).localeCompare(String(b[0])) ||
          Number(a[1]) - Number(b[1])
      )
    assert.deepEqual(hits, [
      ['a.tsx', 3, 'contains a letter or digit'],
      ['a.tsx', 4, 'empty'],
      ['a.tsx', 5, 'contains a letter or digit'],
      ['a.tsx', 6, 'contains a letter or digit'],
      ['a.tsx', 7, 'not a string literal'],
      ['a.tsx', 8, 'not a string literal'],
      ['a.tsx', 10, 'contains a letter or digit'],
      ['a.tsx', 16, 'not a string literal'],
      ['b.ts', 2, 'contains a letter or digit'],
      ['other.ts', 2, 'contains a letter or digit'],
    ])
  })

  test('runVerify reports sep-argument as an error and honours i18n.ignore', async () => {
    const root = project({
      'pikku.config.json': '{"i18n":{"ignore":["packages/console"]}}',
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/console/src/a.ts':
        "import { sep } from '@pikku/react'\nsep('and')",
      'packages/ui-blocks/src/b.ts':
        "import { sep } from '@pikku/react'\nsep('and')",
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      record: false,
    })
    const found = result.findings.filter((f) => f.id === 'sep-argument')
    assert.deepEqual(
      found.map((f) => [f.file, f.line, f.severity]),
      [['packages/ui-blocks/src/b.ts', 2, 'error']]
    )
  })

  test('runVerify reports as-i18n-argument as an error and honours i18n.ignore', async () => {
    const root = project({
      'pikku.config.json': '{"i18n":{"ignore":["packages/console"]}}',
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/console/src/a.ts': "asI18n('Console')",
      'packages/ui-blocks/src/b.ts': "asI18n('Projects')",
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      record: false,
    })
    const found = result.findings.filter((f) => f.id === 'as-i18n-argument')
    assert.deepEqual(
      found.map((f) => [f.file, f.line, f.severity]),
      [['packages/ui-blocks/src/b.ts', 1, 'error']]
    )
    assert.match(found[0]!.message, /b\.ts:1 passes a string literal/)
  })

  test('hardcoded JSX text, not props, messages or allowed separators', () => {
    const root = project({
      'src/a.tsx': [
        'export const A = () => (',
        '  <div title="Hello" aria-label={"Label"}>',
        '    Save changes',
        '    <span>{m.save()}</span>',
        '    <span>·</span>',
        "    <b>{'Cancel'}</b>",
        '    <i>{count} / {total}</i>',
        '    <>Inside fragment</>',
        '  </div>',
        ')',
      ].join('\n'),
      'src/a.stories.tsx': 'export const S = () => <div>Story text</div>',
      'src/b.ts': 'export const t = "plain"',
    })
    assert.deepEqual(
      jsxLiteralText(root).map((h) => [h.line, h.text]),
      [
        [3, 'Save changes'],
        [6, 'Cancel'],
        [8, 'Inside fragment'],
      ]
    )
  })

  test('runVerify flags JSX text in a workspace package outside any frontend', async () => {
    const root = project({
      'pikku.config.json': '{}',
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/ui-blocks/src/Card.tsx':
        'export const Card = () => <p>Welcome back</p>',
      'packages/ui-blocks/node_modules/x/Skip.tsx':
        'export const S = () => <p>Vendor text</p>',
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      record: false,
    })
    const found = result.findings.filter((f) => f.id === 'jsx-literal-text')
    assert.deepEqual(
      found.map((f) => [f.file, f.line, f.severity]),
      [['packages/ui-blocks/src/Card.tsx', 1, 'warn']]
    )
  })

  test('jsxLiteralProps flags copy props, child expressions, templates and helper calls', () => {
    const root = project({
      'src/a.tsx': [
        'export const A = () => (',
        '  <div>',
        '    <Hero title="Welcome back" sub={`Step ${a} of ${b}`} />',
        '    <input placeholder="Search projects" aria-label="Close dialog" />',
        "    <b>{ok ? 'Saved' : 'Failed to save'}</b>",
        "    <i>{name || 'Nobody yet'}</i>",
        '    <u>{`Visits (${n})`}</u>',
        "    <button onClick={() => say('Saved it')}>{m.save()}</button>",
        '  </div>',
        ')',
      ].join('\n'),
    })
    assert.deepEqual(
      jsxLiteralProps(root).map((h) => [h.line, h.via, h.text]),
      [
        [3, 'title', 'Welcome back'],
        [3, 'sub', 'Step {…} of {…}'],
        [4, 'placeholder', 'Search projects'],
        [4, 'aria-label', 'Close dialog'],
        [5, 'child', 'Saved'],
        [5, 'child', 'Failed to save'],
        [6, 'child', 'Nobody yet'],
        [7, 'child', 'Visits ({…})'],
        [8, 'say()', 'Saved it'],
      ]
    )
  })

  test('jsxLiteralProps leaves styling, ids, links, translated copy and code samples alone', () => {
    const root = project({
      'src/a.tsx': [
        'export const A = () => (',
        '  <div className="flex items-center gap-2" id="main-panel" data-testid="Big Thing">',
        '    <a href="/app/projects" title={m.open_project()}>{count} items</a>',
        '    <Field label={m.name()} placeholder="https://example.com/x" hint="user_name" />',
        '    <Field name="Full name" value="Some value here" variant="filled" size="md" />',
        '    <Snippet code="npm install pikku" sample="Hello world" />',
        '    <pre><Tip title="Run this now" /></pre>',
        '    <b>{a ? m.yes() : m.no()}</b>',
        "    <i>{cond ? 'x' : '/'}</i>",
        "    <i>{`import { ${a} } from '${b}'`}</i>",
        "    <Hero title={m.hello({ who: 'Ada Lovelace' })} />",
        '  </div>',
        ')',
      ].join('\n'),
      'src/b.ts': "export const t = say('Not tsx at all')",
    })
    assert.deepEqual(jsxLiteralProps(root), [])
  })

  describe('with the i18n gate on (tsconfig.i18n.json)', () => {
    const sources = {
      'src/a.tsx': [
        'export const A = () => (',
        '  <div title="Plain title">',
        '    <p>Plain text</p>',
        '    <input placeholder="Search projects" />',
        "    <b>{ok ? 'Saved' : 'Failed'}</b>",
        '    <>Fragment text</>',
        '    <Hero title="Welcome back" />',
        '    <Card>Component text</Card>',
        '    <Hero title={m.hello()} />',
        "    <button onClick={() => say('Saved it')}>{m.save()}</button>",
        '  </div>',
        ')',
      ].join('\n'),
    }

    test('without the config every element is checked, as before', () => {
      const root = project(sources)
      assert.deepEqual(
        jsxLiteralText(root).map((h) => h.line),
        [3, 6, 8]
      )
      assert.deepEqual(
        jsxLiteralProps(root).map((h) => [h.line, h.via]),
        [
          [2, 'title'],
          [4, 'placeholder'],
          [5, 'child'],
          [5, 'child'],
          [7, 'title'],
          [10, 'say()'],
        ]
      )
    })

    test('with the config, DOM elements are left to the gate; fragments, components and helper calls stay', () => {
      const root = project({ ...sources, 'tsconfig.i18n.json': '{}' })
      assert.deepEqual(
        jsxLiteralText(root).map((h) => [h.line, h.text]),
        [
          [6, 'Fragment text'],
          [8, 'Component text'],
        ]
      )
      assert.deepEqual(
        jsxLiteralProps(root).map((h) => [h.line, h.via]),
        [
          [7, 'title'],
          [10, 'say()'],
        ]
      )
    })

    test('the choice is per directory: a package without the config keeps checking DOM elements', async () => {
      const root = project({
        'pikku.config.json': '{}',
        'package.json': '{"workspaces":["apps/*","packages/*"]}',
        'apps/web/tsconfig.json': '{}',
        'apps/web/tsconfig.i18n.json': '{}',
        'apps/web/src/A.tsx': 'export const A = () => <p>Gated app</p>',
        'packages/ui/src/B.tsx': 'export const B = () => <p>Open package</p>',
      })
      const result = await runVerify({
        rootDir: root,
        codegen: false,
        typecheck: false,
        frontends: false,
        record: false,
      })
      assert.deepEqual(
        result.findings
          .filter((f) => f.id === 'jsx-literal-text')
          .map((f) => f.file),
        ['packages/ui/src/B.tsx']
      )
    })
  })

  test('runVerify reports jsx-literal-prop as a warning', async () => {
    const root = project({
      'pikku.config.json': '{}',
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/ui-blocks/src/Card.tsx':
        'export const Card = () => <Hero title="Welcome back" />',
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      record: false,
    })
    assert.deepEqual(
      result.findings
        .filter((f) => f.id === 'jsx-literal-prop')
        .map((f) => [f.file, f.line, f.severity]),
      [['packages/ui-blocks/src/Card.tsx', 1, 'warn']]
    )
  })

  test('i18n.ignore in pikku.config.json skips the i18n checks under those paths', async () => {
    const root = project({
      'pikku.config.json': '{"i18n":{"ignore":["packages/console"]}}',
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/console/src/A.tsx':
        'export const A = () => <p>Console text</p>',
      'packages/ui-blocks/src/B.tsx': 'export const B = () => <p>Kept text</p>',
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      typecheck: false,
      record: false,
    })
    assert.deepEqual(
      result.findings
        .filter((f) => f.id === 'jsx-literal-text')
        .map((f) => f.file),
      ['packages/ui-blocks/src/B.tsx']
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

describe('string-literal-copy', () => {
  const lines = (src: string[]): string[] => {
    const root = project({ 'src/a.ts': src.join('\n') })
    return stringLiteralCopy(root).map((h) => h.text)
  }

  test('reports English where copy lives', () => {
    assert.deepEqual(
      lines([
        "export const a = { label: 'Save your changes' }",
        "export const b = ['Try again later', 'Go back']",
        "export const c = () => { return 'Nothing to show yet.' }",
        "export const d = () => 'Something went wrong'",
        "export const e = (x = 'Pick a colour') => x",
        "export const f = ok ? 'All good here' : 'Not so good'",
        "export const g = name || 'Unnamed project'",
        "export const h = name ?? 'Unnamed project 2'",
        "export const i = show('Welcome back')",
        "export const j = 'Hello there'",
        'export const k = `Hello ${name}, welcome`',
        'export const l = `Saved.`',
      ]),
      [
        'Save your changes',
        'Try again later',
        'Go back',
        'Nothing to show yet.',
        'Something went wrong',
        'Pick a colour',
        'All good here',
        'Not so good',
        'Unnamed project',
        'Unnamed project 2',
        'Welcome back',
        'Hello there',
        'Hello {…}, welcome',
      ]
    )
  })

  test('leaves alone what is not copy', () => {
    assert.deepEqual(
      lines([
        "import x from 'some module path'",
        "export { y } from './not copy here'",
        "type T = 'two words'",
        "export const a = { className: 'flex items-center gap-2', style: 'big red box' }",
        "export const b = { 'Some key here': 1 }",
        "export const c = 'https://example.com/a b'",
        "export const d = '/api/users/some thing'",
        'export const e = /two words/',
        "console.log('Hello there world')",
        "throw new Error('Something went wrong here')",
        "export const f = new Error('Internal failure here')",
        "log('Hello there world')",
        "debug('Hello there world')",
        "m.hello_world('Hello there')",
        "asI18n('Hello there world')",
        "asI18nStub('Hello there world')",
        "sep(' · ')",
        "require('some module')",
        "import('some module')",
        "expect(x).toBe('two words here')",
        "describe('does a thing', () => {})",
        "if (x === 'two words') {}",
        "switch (x) { case 'two words': break }",
        "export const g = 'flex flex-col gap-2 text-sm'",
        "export const h = 'select * from users where id = 1'",
        "export const i = 'oneword'",
        "export const j = 'ok'",
        "export const k = x.replace('two words', 'other words')",
        "export const l = 'a'.concat('b')",
        'export const m = `\nYou are an agent.\nDo things well.\n`',
        "export const n = '- Bullet in a prompt'",
        "export const o = 'No Sentence'.length",
      ]),
      []
    )
  })

  test('skips test, story, declaration and generated files; mocks are still read', () => {
    const src = "export const a = { label: 'Save your changes' }\n"
    const root = project({
      'src/a.test.ts': src,
      'src/a.stories.tsx': src,
      'src/a.spec.ts': src,
      'src/a.d.ts': src,
      'src/a.gen.ts': src,
      'src/paraglide/b.ts': src,
      'src/x.scenario.ts': src,
      'src/mocks/m.ts': src,
    })
    assert.deepEqual(
      stringLiteralCopy(root).map((h) => h.file.slice(root.length + 1)),
      ['src/mocks/m.ts']
    )
  })

  test('JSX attributes and children are left to the jsx checks; toast in .tsx is not reported twice', () => {
    const root = project({
      'src/a.tsx': [
        'export const A = () => (',
        '  <div title="Some title here">{"Child text here"}',
        "    <b onClick={() => say('Saved it now')} />",
        '  </div>',
        ')',
        "export const l = 'Standalone label'",
      ].join('\n'),
      'src/b.ts': "say('Saved it now')\n",
    })
    assert.deepEqual(
      stringLiteralCopy(root).map((h) => [
        h.file.slice(root.length + 1),
        h.text,
      ]),
      [
        ['src/b.ts', 'Saved it now'],
        ['src/a.tsx', 'Standalone label'],
      ]
    )
  })

  test('runStaticChecks: a warning, an error under strict, and i18n.ignore is honoured', () => {
    const root = project({
      'package.json': '{}',
      'pikku.config.json': JSON.stringify({
        i18n: { ignore: ['packages/skip'] },
      }),
      'packages/a/package.json': '{}',
      'packages/a/src/a.ts':
        "export const a = { label: 'Save your changes' }\n",
      'packages/skip/package.json': '{}',
      'packages/skip/src/a.ts':
        "export const a = { label: 'Save your changes' }\n",
    })
    const pick = (strict: boolean) =>
      runStaticChecks(readVerifyProject(root), { strict }).filter(
        (f) => f.id === 'string-literal-copy'
      )
    assert.deepEqual(
      pick(false).map((f) => [f.severity, f.file, f.line]),
      [['warn', 'packages/a/src/a.ts', 1]]
    )
    assert.equal(pick(true)[0]!.severity, 'error')
    assert.equal(
      pick(false)[0]!.message,
      'packages/a/src/a.ts:1 "Save your changes" — English outside JSX; use m.<key>() or asI18n(variable)'
    )
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

  test('a tsconfig.i18n.json turns the gate into i18n-gate findings; no file, no step', async () => {
    // Stand-in JSX runtimes: `open` accepts anything, `gate` only text that went through i18n.
    const runtime = (children: string) =>
      [
        'export namespace JSX {',
        '  type Element = {}',
        `  interface IntrinsicElements { p: { children?: ${children} } }`,
        '}',
        'export declare function jsx(type: unknown, props: unknown): {}',
        'export declare function jsxs(type: unknown, props: unknown): {}',
        'export declare const Fragment: unique symbol',
      ].join('\n')
    const base = {
      'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
      'pikku.config.json': '{}',
      'apps/web/node_modules/open-jsx/jsx-runtime.d.ts': runtime('any'),
      'apps/web/node_modules/gate-jsx/jsx-runtime.d.ts': runtime('never'),
      'apps/web/tsconfig.json': JSON.stringify({
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'open-jsx',
          moduleResolution: 'bundler',
          module: 'esnext',
          noEmit: true,
          strict: true,
          types: [],
        },
        include: ['src'],
      }),
      'apps/web/src/a.tsx': 'export const A = () => <p>Hello</p>\n',
    }
    const run = (root: string) =>
      runVerify({ rootDir: root, codegen: false, record: false })

    const silent = await run(project(base))
    assert.deepEqual(
      silent.steps
        .filter((s) => s.id === 'frontend-typecheck')
        .map((s) => s.ok),
      [true]
    )
    assert.equal(silent.findings.filter((f) => f.id === 'i18n-gate').length, 0)

    const gated = await run(
      project({
        ...base,
        'apps/web/tsconfig.i18n.json': JSON.stringify({
          extends: './tsconfig.json',
          compilerOptions: { jsxImportSource: 'gate-jsx' },
        }),
      })
    )
    const gate = gated.findings.filter((f) => f.id === 'i18n-gate')
    assert.equal(gate.length, 1)
    assert.equal(gate[0]!.severity, 'error')
    assert.equal(gate[0]!.step, 'frontend-typecheck')
    assert.equal(gate[0]!.file, 'apps/web/src/a.tsx')
    assert.equal(gate[0]!.line, 1)
    assert.match(gate[0]!.code!, /^TS\d+$/)
    assert.equal(gated.ok, false)
    assert.deepEqual(
      gated.steps
        .filter((s) => s.id === 'frontend-typecheck')
        .map((s) => [s.ok, s.target]),
      [
        [true, 'apps/web'],
        [false, 'apps/web (tsconfig.i18n.json)'],
      ]
    )
  })

  test('a library package with its own tsconfig.i18n.json is gated too, and an error two programs report is one finding', async () => {
    const runtime = (children: string) =>
      [
        'export namespace JSX {',
        '  type Element = {}',
        `  interface IntrinsicElements { p: { children?: ${children} } }`,
        '}',
        'export declare function jsx(type: unknown, props: unknown): {}',
        'export declare function jsxs(type: unknown, props: unknown): {}',
        'export declare const Fragment: unique symbol',
      ].join('\n')
    const tsconfig = (include: string[]) =>
      JSON.stringify({
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'open-jsx',
          moduleResolution: 'bundler',
          module: 'esnext',
          noEmit: true,
          strict: true,
          types: [],
          typeRoots: [],
        },
        include,
      })
    const gate = JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: { jsxImportSource: 'gate-jsx' },
    })
    const root = project({
      'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
      'pikku.config.json': '{}',
      'node_modules/open-jsx/jsx-runtime.d.ts': runtime('any'),
      'node_modules/gate-jsx/jsx-runtime.d.ts': runtime('never'),
      'apps/web/tsconfig.json': tsconfig([
        'src',
        '../../packages/addons/ui/src',
      ]),
      'apps/web/tsconfig.i18n.json': gate,
      'apps/web/src/a.tsx': 'export const A = 1\n',
      'packages/addons/ui/package.json': '{}',
      'packages/addons/ui/tsconfig.json': tsconfig(['src']),
      'packages/addons/ui/tsconfig.i18n.json': gate,
      'packages/addons/ui/src/b.tsx': 'export const B = () => <p>Hello</p>\n',
    })
    const result = await runVerify({
      rootDir: root,
      codegen: false,
      record: false,
    })
    const found = result.findings.filter((f) => f.id === 'i18n-gate')
    assert.deepEqual(
      found.map((f) => [f.file, f.line]),
      [['packages/addons/ui/src/b.tsx', 1]]
    )
    assert.deepEqual(
      result.steps
        .filter((s) => s.id === 'frontend-typecheck')
        .map((s) => s.target),
      [
        'apps/web',
        'apps/web (tsconfig.i18n.json)',
        'packages/addons/ui (tsconfig.i18n.json)',
      ]
    )
  })

  test('the source checks cover packages/addons/* and every package or tsconfig root up to three levels down', () => {
    const root = project({
      'package.json': '{}',
      'pikku.config.json': '{}',
      'apps/web/tsconfig.json': '{}',
      'apps/web/src/a.tsx': 'export const A = () => <p>App text</p>\n',
      'packages/addons/spindle/package.json': '{}',
      'packages/addons/spindle/src/b.tsx':
        'export const B = () => <p>Addon text</p>\n',
      'packages/deep/er/est/package.json': '{}',
      'packages/deep/er/est/c.tsx': 'export const C = () => <p>Too deep</p>\n',
      'packages/x/tsconfig.i18n.json': '{}',
      'packages/x/c.tsx': 'export const D = () => <p>Gated text</p>\n',
      'packages/x/plain/d.tsx': 'export const E = () => <p>No root</p>\n',
      'packages/x/node_modules/dep/package.json': '{}',
      'packages/loose/e.tsx': 'export const F = () => <p>Loose</p>\n',
    })
    const dirs = workspacePackageDirs(root).map((d) => d.slice(root.length + 1))
    assert.deepEqual(dirs.sort(), [
      'apps/web',
      'packages/addons',
      'packages/addons/spindle',
      'packages/deep',
      'packages/deep/er/est',
      'packages/loose',
      'packages/x',
    ])
    const hits = runStaticChecks(readVerifyProject(root))
      .filter((f) => f.id === 'jsx-literal-text')
      .map((f) => f.file)
    assert.deepEqual(hits.sort(), [
      'apps/web/src/a.tsx',
      'packages/addons/spindle/src/b.tsx',
      'packages/deep/er/est/c.tsx',
      'packages/loose/e.tsx',
    ])
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
