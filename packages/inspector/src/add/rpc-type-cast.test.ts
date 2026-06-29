import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

function makeLogger() {
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  const logger: InspectorLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => criticals.push({ code, message }),
    critical: (code, message) => criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  }
  return { logger, criticals }
}

async function runInspect(sourceCode: string) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-rpc-cast-test-'))
  const file = join(tmpDir, 'funcs.ts')
  await writeFile(file, sourceCode)
  const { logger, criticals } = makeLogger()
  try {
    await inspect(logger, [file], { rootDir: tmpDir })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
  return criticals
}

describe('RPC type-cast check — PKU940', () => {
  test('flags rpc.invoke() with an as-cast on an argument', async () => {
    const criticals = await runInspect(`
declare const rpc: { invoke: (name: string, data: unknown) => Promise<unknown> }
export async function doWork() {
  return rpc.invoke('someFunction', { id: 1 } as any)
}
`)
    const hit = criticals.find(
      (c) => c.code === ErrorCode.RPC_INVOCATION_TYPE_CAST
    )
    assert.ok(hit, `Expected PKU940 but got: ${JSON.stringify(criticals)}`)
  })

  test('flags rpc.invoke() with an angle-bracket cast on an argument', async () => {
    const criticals = await runInspect(`
declare const rpc: { invoke: (name: string, data: unknown) => Promise<unknown> }
export async function doWork() {
  return rpc.invoke('someFunction', <any>{ id: 1 })
}
`)
    const hit = criticals.find(
      (c) => c.code === ErrorCode.RPC_INVOCATION_TYPE_CAST
    )
    assert.ok(hit, `Expected PKU940 but got: ${JSON.stringify(criticals)}`)
  })

  test('flags rpc.invoke() result cast with as any', async () => {
    const criticals = await runInspect(`
declare const rpc: { invoke: (name: string, data: unknown) => Promise<unknown> }
export async function doWork() {
  return (rpc.invoke('someFunction', { id: 1 }) as any)
}
`)
    const hit = criticals.find(
      (c) => c.code === ErrorCode.RPC_INVOCATION_TYPE_CAST
    )
    assert.ok(hit, `Expected PKU940 but got: ${JSON.stringify(criticals)}`)
  })

  test('flags rpc.invoke() result cast with as never', async () => {
    const criticals = await runInspect(`
declare const rpc: { invoke: (name: string, data: unknown) => Promise<unknown> }
export async function doWork() {
  return (rpc.invoke('someFunction', { id: 1 }) as never)
}
`)
    const hit = criticals.find(
      (c) => c.code === ErrorCode.RPC_INVOCATION_TYPE_CAST
    )
    assert.ok(hit, `Expected PKU940 but got: ${JSON.stringify(criticals)}`)
  })

  test('does not flag a clean rpc.invoke() call', async () => {
    const criticals = await runInspect(`
declare const rpc: { invoke: (name: string, data: unknown) => Promise<unknown> }
export async function doWork() {
  return rpc.invoke('someFunction', { id: 1 })
}
`)
    const hit = criticals.find(
      (c) => c.code === ErrorCode.RPC_INVOCATION_TYPE_CAST
    )
    assert.equal(
      hit,
      undefined,
      `Expected no PKU940 but got: ${JSON.stringify(hit)}`
    )
  })

  test('does not flag as-casts on unrelated calls', async () => {
    const criticals = await runInspect(`
declare function otherFn(data: unknown): Promise<unknown>
export async function doWork() {
  return otherFn({ id: 1 } as any)
}
`)
    const hit = criticals.find(
      (c) => c.code === ErrorCode.RPC_INVOCATION_TYPE_CAST
    )
    assert.equal(
      hit,
      undefined,
      `Expected no PKU940 but got: ${JSON.stringify(hit)}`
    )
  })
})
