import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readDevAddress,
  recordDevCodegen,
  writeDevAddress,
} from './dev-address.js'
import { devStatus } from './dev-status.js'

let root: string
let printed: string
const originalWrite = process.stdout.write

const status = async () => {
  printed = ''
  process.exitCode = 0
  process.stdout.write = ((chunk: string) => {
    printed += chunk
    return true
  }) as typeof process.stdout.write
  try {
    await devStatus.func({ config: { rootDir: root } } as any, {} as any)
  } finally {
    process.stdout.write = originalWrite
  }
  const code = process.exitCode
  process.exitCode = 0
  return code
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-dev-status-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pikku dev status', () => {
  test('says when nothing is running', async () => {
    assert.equal(await status(), 1)
    assert.match(printed, /not running/)
  })

  test('reports the address, then a failed codegen pass, then its recovery', async () => {
    const runtimeDir = join(root, '.pikku-runtime')
    writeDevAddress(runtimeDir, 'http://localhost:4123')
    assert.equal(await status(), 0)
    assert.match(printed, /http:\/\/localhost:4123/)

    recordDevCodegen(runtimeDir, { ok: false, error: 'PKU489 boom' })
    assert.equal(readDevAddress(runtimeDir)?.codegen?.ok, false)
    assert.equal(await status(), 1)
    assert.match(printed, /Last codegen failed[\s\S]*PKU489 boom/)

    recordDevCodegen(runtimeDir, { ok: true })
    assert.equal(await status(), 0)
    assert.match(printed, /Last codegen succeeded/)
  })
})
