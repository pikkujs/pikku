import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inferMockType, readStubMocks } from './read-stub-mocks.js'

describe('inferMockType', () => {
  test('a field some samples lack is optional, an empty array adds no element shape', () => {
    assert.strictEqual(
      inferMockType([[{ id: 1, note: 'a' }], [{ id: 2 }], []]),
      'Array<{ "id": number; "note"?: string }>'
    )
    assert.strictEqual(inferMockType([[]]), 'Array<unknown>')
  })

  test('differing kinds are or-ed together', () => {
    assert.strictEqual(
      inferMockType([{ a: 1 }, { a: null }]),
      '{ "a": null | number }'
    )
  })
})

describe('readStubMocks', () => {
  test('maps dir names back to rpc names and skips error mocks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    const dir = join(root, 'reminders.list')
    mkdirSync(dir)
    writeFileSync(join(dir, 'healthy.json'), '[{"id":1}]')
    writeFileSync(join(dir, 'broken.json'), '{"message":"nope"}')
    writeFileSync(
      join(dir, 'broken.meta.json'),
      '{"state":"error","status":500}'
    )
    const stubs = await readStubMocks(root)
    rmSync(root, { recursive: true, force: true })
    assert.deepStrictEqual(stubs, [
      { name: 'reminders:list', outputType: 'Array<{ "id": number }>' },
    ])
  })

  test('an RPC with only error mocks is a codegen error, not a silent drop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    const dir = join(root, 'reminders.list')
    mkdirSync(dir)
    writeFileSync(join(dir, 'down.json'), '{"message":"nope"}')
    writeFileSync(join(dir, 'down.meta.json'), '{"state":"error","status":500}')
    const failure = readStubMocks(root)
    await assert.rejects(
      failure,
      /\.mocks\/reminders\.list has only error mocks.*healthy/
    )
    rmSync(root, { recursive: true, force: true })
  })

  test('an empty RPC directory is skipped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    mkdirSync(join(root, 'reminders.list'))
    const stubs = await readStubMocks(root)
    rmSync(root, { recursive: true, force: true })
    assert.deepStrictEqual(stubs, [])
  })

  test('no .mocks dir is no stubs', async () => {
    assert.deepStrictEqual(await readStubMocks('/nonexistent-mocks-dir'), [])
  })
})

describe('readStubMocks with addon mocks', () => {
  test("an addon's mocks type a stub under the wired namespace, and the app adds scenarios", async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    const addon = join(root, 'addon', '.mocks', 'listSetups')
    const app = join(root, 'app', 'studio.listSetups')
    mkdirSync(addon, { recursive: true })
    mkdirSync(app, { recursive: true })
    writeFileSync(join(addon, 'gym.json'), '[{"id":"a"}]')
    writeFileSync(join(app, 'spa.json'), '[{"id":"b","note":"x"}]')
    const stubs = await readStubMocks(join(root, 'app'), [
      {
        namespace: 'studio',
        package: '@scope/addon',
        dir: join(root, 'addon', '.mocks'),
      },
    ])
    rmSync(root, { recursive: true, force: true })
    assert.deepStrictEqual(stubs, [
      {
        name: 'studio:listSetups',
        outputType: 'Array<{ "id": string; "note"?: string }>',
      },
    ])
  })

  test("an app scenario with the addon's name replaces it", async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    const addon = join(root, 'addon', 'listSetups')
    const app = join(root, 'app', 'studio.listSetups')
    mkdirSync(addon, { recursive: true })
    mkdirSync(app, { recursive: true })
    writeFileSync(join(addon, 'gym.json'), '"old"')
    writeFileSync(join(app, 'gym.json'), '1')
    const stubs = await readStubMocks(join(root, 'app'), [
      {
        namespace: 'studio',
        package: '@scope/addon',
        dir: join(root, 'addon'),
      },
    ])
    rmSync(root, { recursive: true, force: true })
    assert.deepStrictEqual(stubs, [
      { name: 'studio:listSetups', outputType: 'number' },
    ])
  })
})
