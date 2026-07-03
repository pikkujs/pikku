import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger, InspectorState } from '../types.js'

function makeLogger(): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }
}

async function inspectFiles(
  files: Record<string, string>
): Promise<{ state: InspectorState; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-rpc-invocations-test-'))
  const paths: string[] = []
  for (const [name, source] of Object.entries(files)) {
    const path = join(dir, name)
    await writeFile(path, source)
    paths.push(path)
  }
  const state = await inspect(makeLogger(), paths, { rootDir: dir })
  return { state, dir }
}

describe('add-rpc-invocations — invokedFunctionsByFile', () => {
  test('body-level rpc.invoke() is attributed to its source file', async () => {
    const { state, dir } = await inspectFiles({
      'caller.ts': `
declare const rpc: { invoke: (name: string, data?: unknown) => Promise<unknown> }
export async function doWork() {
  return rpc.invoke('console:getSchema')
}
`,
      'other.ts': `
export const unrelated = () => 'no invocations here'
`,
    })
    try {
      assert.ok(state.rpc.invokedFunctions.has('console:getSchema'))
      const byFile = state.rpc.invokedFunctionsByFile
      assert.strictEqual(byFile.size, 1)
      const [file, invoked] = [...byFile.entries()][0]!
      assert.ok(file.endsWith('caller.ts'))
      assert.deepStrictEqual([...invoked], ['console:getSchema'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('namespaced body invoke joins serviceAggregation.usedFunctions', async () => {
    const { state, dir } = await inspectFiles({
      'caller.ts': `
declare const rpc: { invoke: (name: string, data?: unknown) => Promise<unknown> }
export async function doWork() {
  await rpc.invoke('ext:goodbye')
  return rpc.invoke('localHelper')
}
`,
    })
    try {
      assert.ok(state.serviceAggregation.usedFunctions.has('ext:goodbye'))
      // Non-namespaced invokes are covered by wiring meta — not added here
      assert.ok(!state.serviceAggregation.usedFunctions.has('localHelper'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('multiple invocations in one file accumulate under that file', async () => {
    const { state, dir } = await inspectFiles({
      'caller.ts': `
declare const rpc: { invoke: (name: string, data?: unknown) => Promise<unknown> }
export async function doWork() {
  await rpc.invoke('console:getSchema')
  return rpc.invoke('listTasks')
}
`,
    })
    try {
      const invoked = [...state.rpc.invokedFunctionsByFile.values()][0]!
      assert.deepStrictEqual(
        [...invoked].sort(),
        ['console:getSchema', 'listTasks']
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('wiring-level ref() lands in invokedFunctions but NOT in the by-file map', async () => {
    // ref() targets belong to their wiring — per-unit filtering must be able
    // to distinguish them from body-level invocations, so they are
    // deliberately excluded from invokedFunctionsByFile.
    const { state, dir } = await inspectFiles({
      'wiring.ts': `
declare const ref: (name: string) => unknown
export const routes = { stream: { func: ref('console:streamWorkflowRun') } }
`,
    })
    try {
      assert.ok(state.rpc.invokedFunctions.has('console:streamWorkflowRun'))
      assert.strictEqual(state.rpc.invokedFunctionsByFile.size, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
