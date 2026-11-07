import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setScaffoldWriteGuard, writeFileInDir } from './file-writer.js'

const logger = { debug: () => {} } as never

describe('per-unit deploy codegen writes', () => {
  let root: string
  let unitOutDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-unit-writes-'))
    unitOutDir = join(root, '.deploy/standalone/units/api/.pikku')
    setScaffoldWriteGuard(join(root, 'src/scaffold'), unitOutDir)
  })

  afterEach(() => {
    setScaffoldWriteGuard(undefined)
    rmSync(root, { recursive: true, force: true })
  })

  test("the unit's own output is written", async () => {
    const file = join(unitOutDir, 'rpc/pikku-rpc-wirings-map.gen.d.ts')
    await writeFileInDir(logger, file, 'unit')
    assert.match(readFileSync(file, 'utf-8'), /unit/)
  })

  test('an SDK map outside the unit is left for the frontends', async () => {
    const file = join(root, 'packages/sdk/src/rpc-map.gen.d.ts')
    await writeFileInDir(logger, file, 'filtered')
    assert.ok(!existsSync(file))
  })

  test('a client file outside the unit is left alone', async () => {
    const file = join(root, 'apps/app/src/pikku/api.gen.ts')
    await writeFileInDir(logger, file, 'filtered')
    assert.ok(!existsSync(file))
  })

  test('scaffold source stays guarded', async () => {
    const file = join(root, 'src/scaffold/rpc.gen.ts')
    await writeFileInDir(logger, file, 'filtered')
    assert.ok(!existsSync(file))
  })

  test('with no guard, everything is written', async () => {
    setScaffoldWriteGuard(undefined)
    const file = join(root, 'apps/app/src/pikku/api.gen.ts')
    await writeFileInDir(logger, file, 'plain')
    assert.ok(existsSync(file))
  })
})
