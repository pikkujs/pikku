import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getInitialInspectorState } from '../inspector.js'
import { generateAllSchemas } from './schema-generator.js'

const debugLines: string[] = []
const logger = {
  debug(message: string) {
    debugLines.push(message)
  },
  info() {},
  warn() {},
  error() {},
} as any

const UNRELATED_FILE_COUNT = 300

let projectDir: string

before(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'pikku-schema-gen-'))
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(
    join(projectDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    })
  )
  writeFileSync(
    join(projectDir, 'src', 'types.ts'),
    'export type Thing = { id: string; count: number }\n'
  )
  // Files the tsconfig picks up but no generated custom type references. They
  // stand in for the bulk of a real project, which the schema program has no
  // reason to load.
  for (let i = 0; i < UNRELATED_FILE_COUNT; i += 1) {
    writeFileSync(
      join(projectDir, 'src', `unrelated-${i}.ts`),
      `export type Unrelated${i} = { a: string; b: number; c: boolean }\n`
    )
  }
})

after(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('generateAllSchemas', () => {
  // NOTE: this must be the first test in the file. The module-level caches are
  // per-process, so only the first call actually builds a program — a later call
  // reuses it and would measure a few MB no matter what.
  //
  // The schema generator builds a second ts.Program over the whole tsconfig —
  // on a real tree that is ~2.5k files and ~600MB, and it used to be pinned at
  // module scope for the life of the process. Combined with the main inspector
  // program it pushed peak heap past 2GB and OOM'd `pikku all` (#982).
  //
  // Only the program is released; cachedTSSchemas (the small result cache that
  // powers the same-process fast path) is deliberately kept.
  test('does not retain the schema ts.Program after returning', async (t) => {
    if (typeof global.gc !== 'function') {
      t.skip('requires --expose-gc')
      return
    }

    const state = getInitialInspectorState(projectDir) as any
    // A distinct type keeps this off the cachedTSSchemas fast path, so the
    // program is genuinely rebuilt (and therefore genuinely retainable) here.
    state.functions.typesMap.addCustomType(
      'RetentionProbeInput',
      '{ probe: string; n: number }',
      []
    )

    global.gc!()
    const before = process.memoryUsage().heapUsed

    await generateAllSchemas(
      logger,
      { tsconfig: join(projectDir, 'tsconfig.json') },
      state
    )

    global.gc!()
    const retainedMB = (process.memoryUsage().heapUsed - before) / 1024 / 1024

    // A retained program (with its SourceFiles and TypeChecker) measures tens of
    // MB even for this one-file fixture; the schemas themselves are a few KB.
    assert.ok(
      retainedMB < 10,
      `expected the schema program to be released, but ${retainedMB.toFixed(1)}MB is still retained after GC`
    )
  })

  // The virtual file explicitly imports every type it needs, so it is a complete
  // root on its own. Rooting the program at the whole tsconfig instead made it
  // load the entire project (2572 files on a real tree vs 870), for no gain in
  // what could be resolved (#982).
  test('scopes the schema program to the virtual file import closure', async () => {
    debugLines.length = 0

    const state = getInitialInspectorState(projectDir) as any
    state.functions.typesMap.addCustomType(
      'ScopingProbeInput',
      '{ scope: string }',
      []
    )

    await generateAllSchemas(
      logger,
      { tsconfig: join(projectDir, 'tsconfig.json') },
      state
    )

    const line = debugLines.find((l) => l.includes('Created schema program'))
    assert.ok(
      line,
      `expected a "Created schema program" debug line, got: ${debugLines.join(' | ')}`
    )

    const fileCount = Number(line!.match(/(\d+) files/)?.[1])
    assert.ok(
      Number.isFinite(fileCount),
      `could not parse a file count out of: ${line}`
    )
    // The virtual file plus types.ts plus the default lib. Rooting at the whole
    // tsconfig would pull in all UNRELATED_FILE_COUNT files on top of that.
    assert.ok(
      fileCount < UNRELATED_FILE_COUNT,
      `expected the schema program to skip the ${UNRELATED_FILE_COUNT} unreferenced files, but it loaded ${fileCount}`
    )
  })

  test('produces a schema for a custom type', async () => {
    const state = getInitialInspectorState(projectDir) as any
    state.functions.typesMap.addCustomType(
      'ThingInput',
      '{ id: string; count: number }',
      []
    )

    const schemas = await generateAllSchemas(
      logger,
      { tsconfig: join(projectDir, 'tsconfig.json') },
      state
    )

    assert.ok(
      Object.keys(schemas).length > 0,
      'expected at least one generated schema'
    )
  })
})
