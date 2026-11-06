import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {
  extractServiceBypass,
  isServiceBypassExempt,
} from './extract-service-bypass.js'

const usageOf = (source: string) =>
  extractServiceBypass(
    ts.createSourceFile('/p/src/f.ts', source, ts.ScriptTarget.ESNext, true)
  )

describe('extractServiceBypass: content (node:fs)', () => {
  const flagged: Array<[string, string, string]> = [
    [
      'static named import',
      "import { readFile } from 'node:fs/promises'",
      "1:import 'node:fs/promises'",
    ],
    ['bare fs default import', "import fs from 'fs'", "1:import 'fs'"],
    [
      'namespace import',
      "import * as fs from 'fs/promises'",
      "1:import 'fs/promises'",
    ],
    ['side-effect import', "import 'node:fs'", "1:import 'node:fs'"],
    ['re-export', "export { readFile } from 'fs'", "1:export from 'fs'"],
    ['require', "const fs = require('node:fs')", "1:require('node:fs')"],
    ['import equals require', "import fs = require('fs')", "1:require('fs')"],
    [
      'dynamic import',
      "const m = await import('fs/promises')",
      "1:import('fs/promises')",
    ],
    [
      'dynamic import in a function body',
      "async function f() {\n  const { readdir } = await import('node:fs')\n}",
      "2:import('node:fs')",
    ],
  ]
  for (const [name, source, expected] of flagged) {
    test(`flags ${name}`, () => {
      assert.deepEqual(usageOf(source).content, [expected])
    })
  }

  const clean: Array<[string, string]> = [
    ['node:path', "import path from 'node:path'"],
    [
      'a local variable named fs',
      'const fs = { readFile: () => 1 }\nfs.readFile()',
    ],
    ['a parameter named fs', 'export const f = (fs: { x: number }) => fs.x'],
    ['a string that looks like an import', `const s = "import fs from 'fs'"`],
    ['a comment', "// import fs from 'fs'"],
    ['a type-only import', "import type { Stats } from 'node:fs'"],
    ['a module that merely starts with fs', "import x from 'fs-extra'"],
    ['a non-literal dynamic import', 'const m = await import(name)'],
    ['an import type expression', "type S = import('node:fs').Stats"],
  ]
  for (const [name, source] of clean) {
    test(`does not flag ${name}`, () => {
      assert.deepEqual(usageOf(source).content, [])
    })
  }
})

describe('extractServiceBypass: variables (process.env)', () => {
  const flagged: Array<[string, string, string]> = [
    ['dot access', 'const a = process.env.API_URL', '1:process.env.API_URL'],
    [
      'element access',
      "const a = process.env['API_URL']",
      "1:process.env['API_URL']",
    ],
    [
      'destructuring process.env',
      'const { API_URL } = process.env',
      '1:process.env',
    ],
    [
      'const { env } = process',
      'const { env } = process',
      '1:const { env } = process',
    ],
    [
      'renamed env from process',
      'const { env: e } = process',
      '1:const { env } = process',
    ],
    ['spreading process.env', 'const a = { ...process.env }', '1:process.env'],
    ['process["env"]', "const a = process['env'].X", '1:process.env.X'],
  ]
  for (const [name, source, expected] of flagged) {
    test(`flags ${name}`, () => {
      assert.deepEqual(usageOf(source).variables, [expected])
    })
  }

  const clean: Array<[string, string]> = [
    ['a string containing process.env', "const s = 'process.env.X'"],
    ['a template literal containing it', 'const s = `read process.env.X`'],
    ['a comment', '// process.env.X'],
    ['process.argv', 'const a = process.argv'],
    ['a local env variable', 'const env = { X: 1 }\nconsole.log(env.X)'],
    ['a different object', 'const a = config.process.env'],
    ['destructuring other process members', 'const { argv } = process'],
  ]
  for (const [name, source] of clean) {
    test(`does not flag ${name}`, () => {
      assert.deepEqual(usageOf(source).variables, [])
    })
  }

  test('reports every read, in source order, without repeats', () => {
    const usage = usageOf(
      [
        'const a = process.env.A',
        'const b = process.env.B',
        'const c = process.env.A + process.env.A',
      ].join('\n')
    )
    assert.deepEqual(usage.variables, [
      '1:process.env.A',
      '2:process.env.B',
      '3:process.env.A',
    ])
  })
})

describe('isServiceBypassExempt', () => {
  test('exempts tests, generated code and declarations', () => {
    for (const file of [
      '/p/src/a.test.ts',
      '/p/src/a.spec.ts',
      '/p/src/auth.gen.ts',
      '/p/.pikku/function/pikku-functions.gen.ts',
      '/p/.pikku/hand-written.ts',
      '/p/src/types.d.ts',
      'C:\\p\\.pikku\\x.ts',
    ]) {
      assert.equal(isServiceBypassExempt(file), true, file)
    }
  })

  test('does not exempt ordinary source', () => {
    for (const file of [
      '/p/src/a.ts',
      '/p/src/test-helpers.ts',
      '/p/src/pikku-utils.ts',
      '/p/src/.pikkuish/a.ts',
    ]) {
      assert.equal(isServiceBypassExempt(file), false, file)
    }
  })
})
