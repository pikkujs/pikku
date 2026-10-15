import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { planRefusal } from './plan-gate.js'

const plan = {
  version: 1,
  changeset: 'cs-1',
  surface: 'backend',
  deferrals: [],
  description: 'One entry a day.',
  covers: [{ note: 'entities/entry.md', hash: 'a1b2c3d4e5f6', complete: true }],
  model: { kind: 'n/a', description: 'None.' },
  functions: {
    kind: 'built',
    description: 'Write.',
    items: [
      {
        name: 'createEntry',
        description: "Creates today's entry.",
        pass: 1,
        wire: { transport: 'http', route: 'POST /entry' },
        scopes: [],
        permission: 'Only the signed-in person writes their own entry',
      },
    ],
  },
  roles: { kind: 'n/a', description: 'One person.' },
  scopes: { kind: 'n/a', description: 'None.' },
  ui: { kind: 'n/a', description: 'None.' },
  scenarios: {
    backend: { kind: 'n/a', description: 'None.' },
    browser: { kind: 'n/a', description: 'None.' },
    permission: { kind: 'n/a', description: 'None.' },
  },
}

const project = (files: Record<string, unknown>) => {
  const root = mkdtempSync(join(tmpdir(), 'plan-gate-'))
  for (const [rel, value] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), JSON.stringify(value))
  }
  return root
}

const PLAN = 'knowledge/plans/cs-1.plan.json'
const BUILT = {
  '.pikku/function/pikku-functions-meta.gen.json': { createEntry: { auth: true } },
  '.pikku/http/pikku-http-wirings-meta.gen.json': { POST: { '/entry': {} } },
}

describe('planRefusal', () => {
  test('no plan refuses even the first change', () => {
    assert.match(planRefusal(project({}), 'cs-1', false)!, /has none/)
  })

  test('a plan lets the first change through before anything is built', () => {
    assert.equal(planRefusal(project({ [PLAN]: plan }), 'cs-1', false), null)
  })

  test('the last change waits for the plan’s first pass', () => {
    assert.match(
      planRefusal(project({ [PLAN]: plan }), 'cs-1', true)!,
      /missing  function createEntry/
    )
  })

  test('the last change goes through once the meta has it', () => {
    assert.equal(
      planRefusal(project({ [PLAN]: plan, ...BUILT }), 'cs-1', true),
      null
    )
  })
})
