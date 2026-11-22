import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = `${root}dist`
const pikkuDir = `${root}.pikku`
const hiddenPikkuDir = `${root}dist/pikku-hidden`

let output: { status: number; delivered: string[] }

before(() => {
  rmSync(outDir, { recursive: true, force: true })
  execFileSync(
    'bun',
    [
      'build',
      'src/entry.ts',
      '--target=node',
      '--format=esm',
      `--outfile=${outDir}/entry.mjs`,
    ],
    { cwd: root, stdio: 'pipe' }
  )
  // Nothing on disk to fall back on: whatever the bundle knows, it carries.
  renameSync(pikkuDir, hiddenPikkuDir)
  try {
    output = JSON.parse(
      execFileSync('node', [`${outDir}/entry.mjs`], {
        cwd: outDir,
        encoding: 'utf8',
      })
    )
  } finally {
    renameSync(hiddenPikkuDir, pikkuDir)
  }
})

after(() => rmSync(outDir, { recursive: true, force: true }))

describe('a bundle with no .pikku directory and no metaService', () => {
  test('ran with the generated tree out of reach', () => {
    assert.equal(existsSync(pikkuDir), true, '.pikku restored after the run')
    assert.equal(output.status, 200)
  })

  test('delivers the declared events to the sink mapped from them', () => {
    assert.deepEqual(output.delivered.sort(), [
      'checkout_completed',
      'page_viewed',
    ])
  })

  test('refuses an event the app does not declare', () => {
    assert.ok(!output.delivered.includes('refund_issued'))
  })
})
