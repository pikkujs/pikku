import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

async function inspectWithWarnings(source: string) {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-start-workflow-test-'))
  const path = join(dir, 'funcs.ts')
  await writeFile(path, source)
  const warnings: string[] = []
  const logger: InspectorLogger = {
    debug: () => {},
    info: () => {},
    warn: (m: string) => warnings.push(m),
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }
  const state = await inspect(logger, [path], { rootDir: dir })
  return { state, dir, warnings }
}

describe('collect-started-workflows — per-function startsWorkflows', () => {
  test('literal rpc.startWorkflow names are recorded on the caller', async () => {
    const { state, dir, warnings } = await inspectWithWarnings(`
import { pikkuFunc } from '@pikku/core'
export const signUp = pikkuFunc({
  func: async ({ kysely }: any, _data: unknown, { rpc }: any) => {
    await rpc.startWorkflow('candidateLifecycle', { id: 1 })
    await rpc!.startWorkflow(\`onboarding\`, {})
    await rpc.startWorkflow("candidateLifecycle", { id: 2 })
    return { ok: true }
  },
})
export const other = pikkuFunc({
  func: async ({ kysely }: any) => ({ ok: true }),
})
`)
    try {
      assert.deepStrictEqual(state.functions.meta['signUp']?.startsWorkflows, [
        'candidateLifecycle',
        'onboarding',
      ])
      assert.strictEqual(
        state.functions.meta['other']?.startsWorkflows,
        undefined
      )
      assert.deepStrictEqual(warnings, [])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('wire.rpc.startWorkflow is recorded too', async () => {
    const { state, dir } = await inspectWithWarnings(`
import { pikkuFunc } from '@pikku/core'
export const caller = pikkuFunc({
  func: async (_services: any, _data: unknown, wire: any) => {
    return wire.rpc.startWorkflow('flow', {})
  },
})
`)
    try {
      assert.deepStrictEqual(state.functions.meta['caller']?.startsWorkflows, [
        'flow',
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a computed workflow name is warned about, not recorded', async () => {
    const { state, dir, warnings } = await inspectWithWarnings(`
import { pikkuFunc } from '@pikku/core'
export const caller = pikkuFunc({
  func: async (_services: any, data: { name: string }, { rpc }: any) => {
    return rpc.startWorkflow(data.name, {})
  },
})
`)
    try {
      assert.strictEqual(
        state.functions.meta['caller']?.startsWorkflows,
        undefined
      )
      assert.strictEqual(
        warnings.filter((w) => w.includes('computed name')).length,
        1
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('handing rpc to a helper gets one warning naming the helpers', async () => {
    const { state, dir, warnings } = await inspectWithWarnings(`
import { pikkuFunc } from '@pikku/core'
const startLifecycle = async (_s: unknown, rpc: any, id: string) =>
  rpc.startWorkflow('lifecycle', { id })
const notify = async (deps: { rpc: any }) => deps.rpc.invoke('send')
export const signUp = pikkuFunc({
  func: async ({ kysely }: any, _data: unknown, { rpc }: any) => {
    await startLifecycle({ kysely }, rpc, 'a')
    await notify({ rpc })
    await rpc.invoke('audit', { rpc: 'not the rpc object' })
    await kysely.transaction(rpc)
    return { ok: true }
  },
})
`)
    try {
      assert.strictEqual(
        state.functions.meta['signUp']?.startsWorkflows,
        undefined
      )
      const handoff = warnings.filter((w) => w.includes('passes rpc to'))
      assert.strictEqual(handoff.length, 1)
      assert.match(handoff[0]!, /signUp passes rpc to notify, startLifecycle/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
