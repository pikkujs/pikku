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
    assert.strictEqual(inferMockType([{ a: 1 }, { a: null }]), '{ "a": null | number }')
  })
})

describe('readStubMocks', () => {
  test('maps dir names back to rpc names and skips error mocks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    const dir = join(root, 'reminders.list')
    mkdirSync(dir)
    writeFileSync(join(dir, 'healthy.json'), '[{"id":1}]')
    writeFileSync(join(dir, 'broken.json'), '{"message":"nope"}')
    writeFileSync(join(dir, 'broken.meta.json'), '{"state":"error","status":500}')
    const stubs = await readStubMocks(root)
    rmSync(root, { recursive: true, force: true })
    assert.deepStrictEqual(stubs, [{ name: 'reminders:list', outputType: 'Array<{ "id": number }>' }])
  })

  test('no .mocks dir is no stubs', async () => {
    assert.deepStrictEqual(await readStubMocks('/nonexistent-mocks-dir'), [])
  })
})
