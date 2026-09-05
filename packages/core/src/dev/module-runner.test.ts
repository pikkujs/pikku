import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import v8 from 'node:v8'
import vm from 'node:vm'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

import {
  createModuleRunner,
  isTopLevelAwaitLimitation,
} from './module-runner.js'

// A forced-GC hook without launching the process with a flag: on Bun use the
// native collector; on Node flip --expose-gc on just long enough to grab `gc`.
const getGc = (): (() => void) => {
  const bun = (globalThis as any).Bun
  if (bun) return () => bun.gc(true)
  v8.setFlagsFromString('--expose-gc')
  const gc = vm.runInNewContext('gc') as () => void
  v8.setFlagsFromString('--no-expose-gc')
  return () => gc()
}

const heapUsedMb = () => process.memoryUsage().heapUsed / 1048576

// V8's --experimental-test-coverage retains coverage data for every compiled
// script for the life of the run, which pins the runner's per-reload compiled
// functions (and would equally pin the old leaky mechanism), so a heap-growth
// measurement can't discriminate a leak from a non-leak while it's on. run-tests.sh
// exports this marker in --coverage mode (the flag itself is not visible to the
// isolated test child). The single-slot registry guarantee below still runs
// unconditionally.
const UNDER_COVERAGE = process.env.PIKKU_TEST_COVERAGE === '1'

describe('createModuleRunner', { concurrency: false }, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pikku-module-runner-'))
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ type: 'module' })
    )
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('runs a TS module and returns its exports', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'todo.ts')
    await writeFile(
      file,
      `interface Todo { id: string }
       export const createTodo = { func: async (_s: any, d: Todo) => ({ id: d.id }) }`
    )

    const result = await runner.run(file)
    assert.equal(result.ok, true)
    const createTodo = (result as { exports: Record<string, unknown> }).exports
      .createTodo as {
      func: (...a: any[]) => Promise<any>
    }
    assert.equal(typeof createTodo.func, 'function')
    assert.deepEqual(await createTodo.func({}, { id: 'abc' }), { id: 'abc' })
  })

  test('top-level import side effects hit the live singleton dependency', async () => {
    // Delegated imports must resolve to the SAME module instance the rest of
    // the process holds, so a user file's wire* side effect mutates live state.
    await writeFile(
      join(tmpDir, 'registry.js'),
      `export const registry = new Map()
       export const wire = (name, cfg) => registry.set(name, cfg)`
    )

    const runner = createModuleRunner()
    const userFile = join(tmpDir, 'wired.ts')
    await writeFile(
      userFile,
      `import { wire } from './registry.js'
       export const createTodo = { func: async () => ({ ok: true }) }
       wire('createTodo', createTodo)`
    )

    const result = await runner.run(userFile)
    assert.equal(result.ok, true)
    const mod = (result as { exports: Record<string, unknown> }).exports

    // Read the dependency through the same resolver the runner uses, so we
    // observe the exact instance the user module's `import` bound to (using a
    // separate `import()` would resolve a distinct copy under the tsx test
    // loader and prove nothing about live-singleton delegation).
    const dep = createRequire(pathToFileURL(userFile))('./registry.js') as {
      registry: Map<string, unknown>
    }
    assert.equal(dep.registry.has('createTodo'), true)
    assert.strictEqual(dep.registry.get('createTodo'), mod!.createTodo)
  })

  test('re-running the same path overwrites a single registry slot', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'value.ts')

    await writeFile(file, `export const value = { func: async () => 'v1' }`)
    const first = await runner.run(file)
    assert.equal(first.ok, true)
    assert.equal(await ((first as any).exports.value as any).func(), 'v1')

    await writeFile(file, `export const value = { func: async () => 'v2' }`)
    const second = await runner.run(file)
    assert.equal(second.ok, true)
    assert.equal(await ((second as any).exports.value as any).func(), 'v2')

    // Stable key: many reloads of one path never grow the registry.
    for (let i = 0; i < 20; i++) await runner.run(file)
    assert.equal(runner.size, 1)
  })

  test('import.meta survives the cjs transform', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'meta.ts')

    // A package with a native binding resolves its own neighbours through
    // `createRequire(import.meta.url)`. Left to the cjs transform that reads
    // `undefined` and every such package fails with "from ''".
    await writeFile(
      file,
      `import { createRequire } from 'node:module'
       export const url = import.meta.url
       export const dir = import.meta.dirname
       export const resolves = () =>
         createRequire(import.meta.url).resolve('./sibling.cjs')`
    )
    await writeFile(join(tmpDir, 'sibling.cjs'), 'module.exports = {}')

    const result = await runner.run(file)
    assert.equal(result.ok, true)
    const mod = (result as { exports: Record<string, unknown> }).exports
    assert.equal(mod.url, pathToFileURL(file).href)
    assert.equal(mod.dir, tmpDir)
    assert.match((mod.resolves as () => string)(), /sibling\.cjs$/)
  })

  test('reports a bad edit with its reason so the caller can say why', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'broken.ts')
    await writeFile(
      file,
      `export const oops = { func: async () => ( } ] syntax`
    )
    const result = await runner.run(file)
    assert.equal(result.ok, false)
    // The caller keeps serving the old code, so this error is the only thing
    // standing between the developer and an unexplained stale response.
    const { error } = result as { error: Error }
    assert.ok(error instanceof Error)
    assert.match(error.message, /broken\.ts/)
    assert.equal(isTopLevelAwaitLimitation(error), false)
  })

  test('names the top-level await limitation as such', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'tla.ts')
    await writeFile(
      file,
      `const config = await Promise.resolve({ ok: true })
       export const load = { func: async () => config }`
    )
    const result = await runner.run(file)
    assert.equal(result.ok, false)
    // Nothing is wrong with this file — the `cjs` emit is what cannot take it,
    // and the caller has to be able to tell the developer that.
    assert.equal(
      isTopLevelAwaitLimitation((result as { error: Error }).error),
      true
    )
  })

  test('a thrown non-Error still arrives as an Error carrying its value', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'throws-a-string.ts')
    await writeFile(file, `throw 'boom'`)
    const result = await runner.run(file)
    assert.equal(result.ok, false)
    const { error } = result as { error: Error }
    assert.ok(error instanceof Error)
    assert.equal(error.message, 'boom')
    assert.equal((error as { cause?: unknown }).cause, 'boom')
  })

  test('editing and reimporting a module 200x does not leak memory', async () => {
    const gc = getGc()
    const runner = createModuleRunner()
    const file = join(tmpDir, 'big.ts')
    // A sizeable module edited on every reload (the real dev pattern). The old
    // fresh-URL reimport left one of these in the native ESM loader map per
    // edit (~0.3-1.3 MB each) — ~84 MB (Node) / ~222 MB (Bun) over 200 edits —
    // and OOMed. The evictable runner overwrites a single stable slot, so the
    // previous module is collected and heap stays bounded.
    const payload = JSON.stringify(
      Array.from({ length: 2000 }, (_, i) => ({ i, s: 'field_' + i }))
    )
    const write = (marker: number) =>
      writeFile(
        file,
        `export const data = ${payload}
         export const handler = { func: async () => data.length }
         // edit ${marker}`
      )

    // Warm up (first compile allocates esbuild + shared caches), then baseline.
    await write(0)
    await runner.run(file)
    gc()
    const baseline = heapUsedMb()

    for (let i = 1; i <= 200; i++) {
      await write(i)
      const result = await runner.run(file)
      assert.equal(result.ok, true)
    }
    gc()
    const growth = heapUsedMb() - baseline

    assert.equal(runner.size, 1)
    if (UNDER_COVERAGE) return
    assert.ok(
      growth < 15,
      `heap grew ${growth.toFixed(1)} MB over 200 edits (expected < 15 MB)`
    )
  })
})
