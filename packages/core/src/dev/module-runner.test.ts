import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import v8 from 'node:v8'
import vm from 'node:vm'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

import { createModuleRunner } from './module-runner.js'

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

    const mod = await runner.run(file)
    assert.ok(mod)
    const createTodo = mod!.createTodo as {
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

    const mod = await runner.run(userFile)
    assert.ok(mod)

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
    assert.equal(await (first!.value as any).func(), 'v1')

    await writeFile(file, `export const value = { func: async () => 'v2' }`)
    const second = await runner.run(file)
    assert.equal(await (second!.value as any).func(), 'v2')

    // Stable key: many reloads of one path never grow the registry.
    for (let i = 0; i < 20; i++) await runner.run(file)
    assert.equal(runner.size, 1)
  })

  test('returns null on a bad edit so the caller keeps old code', async () => {
    const runner = createModuleRunner()
    const file = join(tmpDir, 'broken.ts')
    await writeFile(
      file,
      `export const oops = { func: async () => ( } ] syntax`
    )
    const mod = await runner.run(file)
    assert.equal(mod, null)
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
      const mod = await runner.run(file)
      assert.ok(mod)
    }
    gc()
    const growth = heapUsedMb() - baseline

    assert.equal(runner.size, 1)
    assert.ok(
      growth < 15,
      `heap grew ${growth.toFixed(1)} MB over 200 edits (expected < 15 MB)`
    )
  })
})
