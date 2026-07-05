import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
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

describe('function body spans in meta', () => {
  test('meta records 1-indexed bodyStart/bodyEnd lines of the handler body', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-span-'))
    const file = join(rootDir, 'my.function.ts')
    await writeFile(
      file,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'", // line 1
        '', // 2
        'export const spanProbe = pikkuSessionlessFunc({', // 3
        '  func: async ({ logger }, data: { n: number }) => {', // 4
        '    const doubled = data.n * 2', // 5
        '    return { doubled }', // 6
        '  },', // 7
        '})', // 8
      ].join('\n')
    )
    try {
      const state = await inspect(logger, [file], { rootDir })
      const meta = (state.functions.meta as any).spanProbe
      assert.ok(meta, 'spanProbe should be inspected')
      assert.equal(
        meta.bodyStart,
        5,
        `bodyStart should be 5, got ${meta.bodyStart}`
      )
      assert.equal(meta.bodyEnd, 6, `bodyEnd should be 6, got ${meta.bodyEnd}`)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('meta records bodySourceFile when the handler is imported from another file', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-span-'))
    const handlerFile = join(rootDir, 'handlers.ts')
    const wiringFile = join(rootDir, 'my.function.ts')
    await writeFile(
      handlerFile,
      [
        'export const importedHandler = async (', // line 1
        '  { logger }: any,', // 2
        '  data: { n: number }', // 3
        ') => {', // 4
        '  const doubled = data.n * 2', // 5
        '  return { doubled }', // 6
        '}', // 7
      ].join('\n')
    )
    await writeFile(
      wiringFile,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        "import { importedHandler } from './handlers.js'",
        '',
        'export const importedProbe = pikkuSessionlessFunc({',
        '  func: importedHandler,',
        '})',
      ].join('\n')
    )
    try {
      const state = await inspect(logger, [wiringFile, handlerFile], {
        rootDir,
      })
      const meta = (state.functions.meta as any).importedProbe
      assert.ok(meta, 'importedProbe should be inspected')
      assert.equal(meta.sourceFile, wiringFile)
      assert.equal(
        meta.bodySourceFile,
        handlerFile,
        `bodySourceFile should be the handler file, got ${meta.bodySourceFile}`
      )
      assert.equal(meta.bodyStart, 5)
      assert.equal(meta.bodyEnd, 6)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
