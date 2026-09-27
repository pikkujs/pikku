import assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  clearDevAddress,
  readDevAddress,
  writeDevAddress,
} from './dev-address.js'

const runtimeDir = (): string => mkdtempSync(join(tmpdir(), 'pikku-dev-'))

test('a running dev server is readable by whatever needs to find it', () => {
  const dir = runtimeDir()
  writeDevAddress(dir, 'http://localhost:3001')
  assert.equal(readDevAddress(dir)?.apiUrl, 'http://localhost:3001')
  assert.equal(readDevAddress(dir)?.pid, process.pid)
})

test('an address whose process is gone reads as no address at all', () => {
  const dir = runtimeDir()
  writeFileSync(
    join(dir, 'dev-address.json'),
    JSON.stringify({ apiUrl: 'http://localhost:3000', pid: 2 ** 30 }),
    'utf8'
  )
  assert.equal(readDevAddress(dir), null)
})

test('a clearing is idempotent and leaves nothing behind', () => {
  const dir = runtimeDir()
  writeDevAddress(dir, 'http://localhost:3000')
  clearDevAddress(dir)
  clearDevAddress(dir)
  assert.equal(readDevAddress(dir), null)
})

test('a file that is not an address is ignored rather than thrown on', () => {
  const dir = runtimeDir()
  writeFileSync(join(dir, 'dev-address.json'), 'not json', 'utf8')
  assert.equal(readDevAddress(dir), null)
})
