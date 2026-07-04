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
})
