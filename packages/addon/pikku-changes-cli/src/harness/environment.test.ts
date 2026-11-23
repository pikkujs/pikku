import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ENVIRONMENT_CODES,
  environmentError,
  environmentOnly,
  splitEnvironment,
} from './environment.js'
import type { Finding } from './finding.js'
import { mainFailure } from './main-check.js'

const PROJECT = '/work/project'
const high = (
  rule: string,
  message: string,
  file?: string,
  line?: number
): Finding => ({
  ...(file ? { file } : {}),
  ...(line === undefined ? {} : { line }),
  severity: 'high',
  rule: `pikku/${rule}`,
  message,
})
const missing = (module: string, file: string, line: number) =>
  high(
    'TS2307',
    `Cannot find module '${module}' or its corresponding type declarations. (project app)`,
    file,
    line
  )

/** What `pikku check` found in a starter project's main checkout with no installed dependencies (the third real run). */
const STARTER: Finding[] = [
  high(
    'PKU340',
    `Addon 'admin' ('@pikku/addon-admin') is wired with wireAddon but cannot be resolved from ${PROJECT}/packages/functions — every ref('admin:…') will resolve to nothing and the surface will be dead at runtime. Add it to the dependencies of ${PROJECT}/packages/functions/package.json and install, or remove the wireAddon call.`
  ),
  high('CODEGEN', 'Pikku inspection failed due to critical diagnostics'),
  high(
    'TS2688',
    "Cannot find type definition file for '@pikku/playwright'. The file is in the program because: Entry point of type library '@pikku/playwright' specified in compilerOptions (project functions)"
  ),
  high(
    'TS2688',
    "Cannot find type definition file for 'node'. The file is in the program because: Entry point of type library 'node' specified in compilerOptions (project functions)"
  ),
  missing('@project/blocks/ui/button', 'src/components/AppShell.tsx', 4),
  missing('@project/blocks/ui/button', 'src/components/AuthCard.tsx', 2),
  missing('@project/blocks/ui/card', 'src/components/AuthCard.tsx', 10),
  missing('@project/blocks/ui/input', 'src/components/AuthCard.tsx', 11),
  missing('@project/blocks/ui/label', 'src/components/AuthCard.tsx', 12),
  missing(
    '@project/blocks/ui/button',
    'src/components/DefaultErrorPage.tsx',
    2
  ),
  missing(
    '@project/blocks/ui/button',
    'src/components/DefaultNotFoundPage.tsx',
    2
  ),
  missing('@project/blocks/lib/utils', 'src/components/layout/nav.tsx', 7),
  missing('@pikku/vite', 'vite.config.ts', 7),
]

const typeError = high(
  'TS2322',
  "Type 'string' is not assignable to type 'number'. (project functions)",
  'src/functions/greet.function.ts',
  16
)

describe('environment findings', () => {
  test('the codes', () => {
    assert.deepEqual(
      [...ENVIRONMENT_CODES],
      ['PKU340', 'TS2307', 'TS2688', 'CODEGEN']
    )
  })

  test("the starter's thirteen findings without installed dependencies are all environment", () => {
    assert.equal(STARTER.length, 13)
    assert.equal(environmentOnly(STARTER), true)
    assert.deepEqual(splitEnvironment(STARTER), {
      environment: STARTER,
      code: [],
    })
  })

  test('a module named by a relative or absolute path, a path alias or a subpath import is code', () => {
    for (const name of [
      './missing',
      '../lib/x',
      '/abs/x',
      '@/components/x',
      '~/x',
      '#lib/x',
    ])
      assert.equal(environmentOnly([missing(name, 'src/a.ts', 1)]), false, name)
    for (const name of [
      'zod',
      '@pikku/vite',
      '@project/blocks/ui/button',
      'lodash/fp',
    ])
      assert.equal(environmentOnly([missing(name, 'src/a.ts', 1)]), true, name)
  })

  test('a missing export (TS2305, TS2724) is code', () => {
    const exports = [
      high(
        'TS2305',
        "Module '@pikku/core' has no exported member 'nope'.",
        'src/a.ts',
        1
      ),
      high(
        'TS2724',
        "'@pikku/core' has no exported member named 'nop'. Did you mean 'nope'?",
        'src/a.ts',
        2
      ),
    ]
    assert.equal(environmentOnly(exports), false)
    assert.deepEqual(splitEnvironment(exports).code, exports)
  })

  test('CODEGEN alone is code, and next to a code finding it stays code', () => {
    const codegen = high(
      'CODEGEN',
      'Pikku inspection failed due to critical diagnostics'
    )
    assert.equal(environmentOnly([codegen]), false)
    const mixed = [...STARTER, typeError]
    assert.equal(environmentOnly(mixed), false)
    const { environment, code } = splitEnvironment(mixed)
    assert.deepEqual(code, [codegen, typeError])
    assert.equal(environment.length, 12)
  })

  test('no findings is not an environment error', () => {
    assert.equal(environmentOnly([]), false)
  })

  test('the infra error says dependencies are missing and lists the first five findings, redacted', () => {
    const secret = high(
      'TS2688',
      "Cannot find type definition file for 'node' token=abcdefgh12345678"
    )
    const error = environmentError([secret, ...STARTER], 'the main checkout')
    assert.equal(error.kind, 'environment')
    assert.match(
      error.message,
      /^Dependencies are missing or broken in the main checkout:/
    )
    assert.match(error.message, /Its check found 14:/)
    assert.equal(
      error.message.split('\n').filter((l) => l.startsWith('- ')).length,
      5
    )
    assert.match(error.message, /… and 9 more$/)
    assert.doesNotMatch(error.message, /abcdefgh12345678/)
  })

  test('a mixed failure lists the code findings to fix and the environment findings apart, as not code to fix', () => {
    const text = mainFailure([
      { gate: 'check', findings: [typeError, STARTER[2]!, STARTER[12]!] },
    ])
    const [code, environment] = text.split('\n\n')
    assert.match(
      code!,
      /^check \(1\):\n- src\/functions\/greet\.function\.ts:16 \[high\] pikku\/TS2322/
    )
    assert.doesNotMatch(code!, /TS2688|TS2307/)
    assert.match(
      environment!,
      /^Environment findings \(2\): .*They are not code to fix/
    )
    assert.match(environment!, /pikku\/TS2688[\s\S]*@pikku\/vite/)
  })
})
