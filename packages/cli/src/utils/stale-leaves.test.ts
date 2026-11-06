import assert from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { hasStaleImport, repairStaleLeaves } from './stale-leaves.js'

const project = (variables: string, leaf: string) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-stale-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, '.pikku/variables'), { recursive: true })
  writeFileSync(join(root, 'src/variables.ts'), variables)
  const file = join(root, '.pikku/variables/pikku-variables.gen.ts')
  writeFileSync(file, leaf)
  return file
}

const leaf = (name: string) =>
  `import type { z } from 'zod'
import './meta.gen.json' with { type: 'json' }
import { ${name} } from '../../src/variables.js'
export const m = 1
`

const logger = { debug() {}, info() {} } as any

test('an import the source still exports is not stale', () => {
  const file = project(`export const A = 1`, leaf('A'))
  assert.equal(hasStaleImport(file), false)
})

test('a removed export is stale', () => {
  const file = project(`export const B = 1`, leaf('A'))
  assert.equal(hasStaleImport(file), true)
})

test('a removed source file is stale', () => {
  const file = project('', leaf('A').replace('variables.js', 'gone.js'))
  assert.equal(hasStaleImport(file), true)
})

test('a re-export is taken on trust, and every export form counts', () => {
  const trusted = project(`export * from './other.js'`, leaf('A'))
  assert.equal(hasStaleImport(trusted), false)
  const named = project(`const a = 1\nexport { a as A }`, leaf('A'))
  assert.equal(hasStaleImport(named), false)
})

test('a multi-line export block and a renamed import count', () => {
  const block = project(`const a = 1\nexport {\n  a as A,\n}`, leaf('A'))
  assert.equal(hasStaleImport(block), false)
  const renamed = project(`export const A = 1`, leaf('A as B'))
  assert.equal(hasStaleImport(renamed), false)
})

test('a missing leaf is not stale', () => {
  assert.equal(hasStaleImport('/nowhere/leaf.gen.ts'), false)
})

test('a stale leaf is rewritten with nothing left to import', async () => {
  const file = project(`export const B = 1`, leaf('A'))
  await repairStaleLeaves(logger, { variablesFile: file, packageMappings: {} })
  assert.doesNotMatch(readFileSync(file, 'utf8'), /src\/variables/)
  assert.equal(hasStaleImport(file), false)
})

test('a healthy leaf is left alone', async () => {
  const file = project(`export const A = 1`, leaf('A'))
  await repairStaleLeaves(logger, { variablesFile: file, packageMappings: {} })
  assert.equal(readFileSync(file, 'utf8'), leaf('A'))
})
