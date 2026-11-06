import assert from 'node:assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
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

const events = (declaration: string) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-stale-'))
  mkdirSync(join(root, 'src/scaffold'), { recursive: true })
  writeFileSync(join(root, 'src/analytics.ts'), declaration)
  writeFileSync(
    join(root, 'src/scaffold/analytics.schemas.gen.ts'),
    `import { analyticsEvents as events0 } from '../analytics.js'
export const a = events0['signed_up'].shape
`
  )
  return {
    root,
    analyticsFile: join(root, 'src/scaffold/analytics.gen.ts'),
    schemasFile: join(root, 'src/scaffold/analytics.schemas.gen.ts'),
  }
}

const declares = (body: string) =>
  `export const analyticsEvents = defineAnalyticsEvents({\n${body}\n})\n`

test('an event still declared is not stale', () => {
  const { schemasFile } = events(declares(`  signed_up: z.object({}),`))
  assert.equal(hasStaleImport(schemasFile), false)
})

test('a shorthand or quoted event still counts as declared', () => {
  const shorthand = events(declares(`  signed_up,`))
  assert.equal(hasStaleImport(shorthand.schemasFile), false)
  const quoted = events(declares(`  'signed_up': z.object({}),`))
  assert.equal(hasStaleImport(quoted.schemasFile), false)
})

test('a removed event is stale', () => {
  const { schemasFile } = events(declares(`  page_viewed: z.object({}),`))
  assert.equal(hasStaleImport(schemasFile), true)
})

test('an event left only in a comment is stale', () => {
  const { schemasFile } = events(
    `/** signed_up: a placeholder, like \`signed_up\`, */\n// signed_up: old\n` +
      declares(`  page_viewed: z.object({}),`)
  )
  assert.equal(hasStaleImport(schemasFile), true)
})

test('a stale analytics schemas module is removed, a current one kept', async () => {
  const stale = events(declares(`  page_viewed: z.object({}),`))
  await repairStaleLeaves(logger, {
    analyticsFile: stale.analyticsFile,
    packageMappings: {},
  })
  assert.equal(existsSync(stale.schemasFile), false)

  const current = events(declares(`  signed_up: z.object({}),`))
  await repairStaleLeaves(logger, {
    analyticsFile: current.analyticsFile,
    packageMappings: {},
  })
  assert.equal(existsSync(current.schemasFile), true)
})

test('custom types go with a stale analytics module and stay otherwise', async () => {
  const run = async (body: string) => {
    const { root, analyticsFile } = events(declares(body))
    const customTypesDeclarationFile = join(root, 'custom-types.gen.d.ts')
    writeFileSync(customTypesDeclarationFile, 'export type Old = 1\n')
    await repairStaleLeaves(logger, {
      analyticsFile,
      customTypesDeclarationFile,
      packageMappings: {},
    })
    return existsSync(customTypesDeclarationFile)
  }
  assert.equal(await run(`  page_viewed: z.object({}),`), false)
  assert.equal(await run(`  signed_up: z.object({}),`), true)
})
