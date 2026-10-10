import assert from 'node:assert'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { codegenStateFile, hasChangesSince } from './codegen-child.js'

const project = (): string => mkdtempSync(join(tmpdir(), 'pikku-codegen-'))

test('a source file edited after codegen started counts as a change', () => {
  const dir = project()
  const file = join(dir, 'a.ts')
  writeFileSync(file, 'export {}')
  const started = Date.now()
  utimesSync(file, new Date(started - 5000), new Date(started - 5000))
  assert.equal(hasChangesSince([dir], started), false)
  utimesSync(file, new Date(started + 5000), new Date(started + 5000))
  assert.equal(hasChangesSince([dir], started), true)
})

test('generated files and node_modules do not count as changes', () => {
  const dir = project()
  mkdirSync(join(dir, 'node_modules'))
  const later = new Date(Date.now() + 5000)
  for (const name of ['x.gen.ts', 'node_modules/y.ts']) {
    const file = join(dir, name)
    writeFileSync(file, 'export {}')
    utimesSync(file, later, later)
  }
  assert.equal(hasChangesSince([dir], Date.now()), false)
})

test('a directory that does not exist has no changes', () => {
  assert.equal(hasChangesSince([join(tmpdir(), 'pikku-missing-dir')], 0), false)
})

test('each codegen run gets its own state file', () => {
  assert.notEqual(codegenStateFile(), codegenStateFile())
})
