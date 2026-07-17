import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const logger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

async function inspectSource(source: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-dynimport-'))
  const file = join(rootDir, 'my.function.ts')
  await writeFile(file, source)
  try {
    return await inspect(logger, [file], { rootDir })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('dynamic import in function bodies', () => {
  test('flags a function whose body does `await import(...)`', async () => {
    const state = await inspectSource(
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        '',
        'export const greedy = pikkuSessionlessFunc({',
        '  func: async ({ logger }) => {',
        "    const { readFile } = await import('node:fs/promises')",
        '    return { readFile: typeof readFile }',
        '  },',
        '})',
      ].join('\n')
    )
    const meta = (state.functions.meta as any).greedy
    assert.ok(meta, 'greedy should be inspected')
    assert.ok(state.functions.dynamicImportIds.has(meta.pikkuFuncId))
    const diagnostic = state.diagnostics.find(
      (d) => d.code === ErrorCode.FUNCTION_DYNAMIC_IMPORT
    )
    assert.ok(
      diagnostic,
      'expected a FUNCTION_DYNAMIC_IMPORT diagnostic for the function'
    )
  })

  test('flags a nested `import(...)` call inside a callback', async () => {
    const state = await inspectSource(
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        '',
        'export const nested = pikkuSessionlessFunc({',
        '  func: async ({ logger }) => {',
        '    await Promise.all([',
        "      import('node:os').then((m) => m.hostname()),",
        '    ])',
        '    return { ok: true }',
        '  },',
        '})',
      ].join('\n')
    )
    const meta = (state.functions.meta as any).nested
    assert.ok(state.functions.dynamicImportIds.has(meta.pikkuFuncId))
    assert.ok(
      state.diagnostics.some(
        (d) => d.code === ErrorCode.FUNCTION_DYNAMIC_IMPORT
      )
    )
  })

  test('does NOT flag a function with only static imports', async () => {
    const state = await inspectSource(
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        '',
        'export const clean = pikkuSessionlessFunc({',
        '  func: async ({ logger }, data: { n: number }) => {',
        '    return { doubled: data.n * 2 }',
        '  },',
        '})',
      ].join('\n')
    )
    const meta = (state.functions.meta as any).clean
    assert.ok(meta, 'clean should be inspected')
    assert.ok(!state.functions.dynamicImportIds.has(meta.pikkuFuncId))
    assert.ok(
      !state.diagnostics.some(
        (d) => d.code === ErrorCode.FUNCTION_DYNAMIC_IMPORT
      )
    )
  })

  test('does NOT flag a type-only import position `import("x").T`', async () => {
    const state = await inspectSource(
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        '',
        'export const typeOnly = pikkuSessionlessFunc({',
        "  func: async ({ logger }, data: import('node:buffer').Blob) => {",
        '    return { size: data.size }',
        '  },',
        '})',
      ].join('\n')
    )
    const meta = (state.functions.meta as any).typeOnly
    assert.ok(meta, 'typeOnly should be inspected')
    assert.ok(!state.functions.dynamicImportIds.has(meta.pikkuFuncId))
  })
})
