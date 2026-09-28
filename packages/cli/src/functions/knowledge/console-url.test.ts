import assert from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { writeDevAddress } from '../commands/dev-address.js'
import { knowledgeConsoleUrl } from './console-url.js'

const PLAN = 'knowledge/milestones/01-the daily entry.plan.json'

test('with no dev server running, the link targets the default port', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-knowledge-'))
  assert.equal(
    knowledgeConsoleUrl({ rootDir }, PLAN),
    'http://localhost:3000/console/knowledge?id=knowledge/milestones/01-the%20daily%20entry.plan.json'
  )
})

test('a running dev server is linked on the port it actually got', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-knowledge-'))
  const runtimeDir = join(rootDir, 'runtime')
  writeDevAddress(runtimeDir, 'http://127.0.0.1:4123/')
  assert.equal(
    knowledgeConsoleUrl({ rootDir, runtimeDir }, PLAN),
    'http://127.0.0.1:4123/console/knowledge?id=knowledge/milestones/01-the%20daily%20entry.plan.json'
  )
})

test('a result that names no file has no link', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-knowledge-'))
  assert.equal(knowledgeConsoleUrl({ rootDir }, ''), undefined)
})
