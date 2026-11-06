import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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

const inspectFiles = async (files: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-bypass-'))
  try {
    const paths: string[] = []
    for (const [name, source] of Object.entries(files)) {
      const file = join(rootDir, name)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, source)
      paths.push(file)
    }
    return await inspect(logger, paths, { rootDir })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const codes = (state: Awaited<ReturnType<typeof inspect>>) =>
  state.diagnostics.map((d) => d.code).sort()

describe('direct content and environment access diagnostics', () => {
  test('flags fs and process.env in project source, one diagnostic each', async () => {
    const state = await inspectFiles({
      'src/reader.ts': [
        "import { readdir } from 'node:fs/promises'",
        'export const list = () => readdir(process.env.DATA_DIR!)',
      ].join('\n'),
    })
    assert.deepEqual(codes(state), [
      ErrorCode.DIRECT_CONTENT_ACCESS,
      ErrorCode.DIRECT_ENV_ACCESS,
    ])
    const content = state.diagnostics.find(
      (d) => d.code === ErrorCode.DIRECT_CONTENT_ACCESS
    )!
    assert.match(content.message, /`content` service/)
    assert.match(content.message, /src\/reader\.ts/)
    const env = state.diagnostics.find(
      (d) => d.code === ErrorCode.DIRECT_ENV_ACCESS
    )!
    assert.match(env.message, /`variables` service/)
    assert.match(env.message, /`secrets` service/)
    assert.match(env.message, /line 2 process\.env\.DATA_DIR/)
  })

  test('exempts test, spec and generated files', async () => {
    const source = "import fs from 'fs'\nexport const a = process.env.X"
    const state = await inspectFiles({
      'src/a.test.ts': source,
      'src/a.spec.ts': source,
      'src/auth.gen.ts': source,
      '.pikku/auth/hand.ts': source,
    })
    assert.deepEqual(codes(state), [])
  })

  test('no false positives on path, local fs and strings', async () => {
    const state = await inspectFiles({
      'src/clean.ts': [
        "import path from 'node:path'",
        'const fs = { readFile: () => 1 }',
        'export const a = path.join(String(fs.readFile()), "process.env.X")',
      ].join('\n'),
    })
    assert.deepEqual(codes(state), [])
  })
})
