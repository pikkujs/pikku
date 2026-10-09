import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { holdFinding, readHeld } from './held-findings.js'

let dir: string
const env = { ...process.env }

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pikku-held-'))
  process.env.FABRIC_FINDINGS_DIR = dir
})

afterEach(async () => {
  process.env = { ...env }
  await rm(dir, { recursive: true, force: true })
})

test('findings held in the same millisecond come back in the order they were held', async () => {
  const reportedAt = new Date().toISOString()
  const titles = Array.from({ length: 20 }, (_, i) => `finding ${i}`)
  for (const title of titles) {
    await holdFinding({ title, runId: 'run', reportedAt } as any)
  }

  const held = await readHeld('run')

  assert.deepEqual(
    held.map((h) => h.payload.title),
    titles
  )
})
