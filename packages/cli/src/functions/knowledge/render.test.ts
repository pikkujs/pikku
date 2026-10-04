import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { KnowledgePlanProgressResult } from '@pikku/knowledge'
import { renderKnowledgeGaps, renderKnowledgePlanProgress } from './render.js'

const result = (
  over: Partial<KnowledgePlanProgressResult> = {}
): KnowledgePlanProgressResult => ({
  ok: false,
  path: 'knowledge/plans/the-daily-entry.plan.json',
  message: '',
  done: [],
  missing: [],
  deferred: [],
  problems: [],
  ...over,
})

const capture = (run: () => void): string => {
  const lines: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '))
  }
  try {
    run()
  } finally {
    console.log = log
  }
  return lines.join('\n')
}

// The exit code is the whole point of the command: the build gate reads it, not the prose.
describe('renderKnowledgePlanProgress', () => {
  // Cleared going in as well as coming out. `process.exitCode` belongs to the
  // process, not the test, so when the suite shares one between files these
  // tests start on whatever the last command left there — and `0` instead of
  // `undefined` is enough to fail an assertion that a render set no code.
  beforeEach(() => {
    process.exitCode = undefined
  })

  afterEach(() => {
    process.exitCode = undefined
  })

  test('the console link is printed when there is one', () => {
    const url =
      'http://localhost:3000/console/knowledge?id=knowledge/m.plan.json'
    const out = capture(() =>
      renderKnowledgePlanProgress(null, {
        ...result({ ok: true }),
        consoleUrl: url,
      })
    )
    assert.ok(out.includes(url))
  })

  test('a built first pass exits zero', () => {
    const out = capture(() =>
      renderKnowledgePlanProgress(
        null,
        result({ ok: true, done: ['function createEntry'] })
      )
    )
    assert.equal(process.exitCode, undefined)
    assert.ok(out.includes("the plan's first pass is built"))
  })

  test('a missing item exits non-zero and names the way out', () => {
    const out = capture(() =>
      renderKnowledgePlanProgress(
        null,
        result({ missing: ['function createEntry'] })
      )
    )
    assert.equal(process.exitCode, 1)
    assert.ok(out.includes('plan defer'))
  })

  // A problem is not deferrable, so pointing the reader at `defer` would send them to a
  // command that refuses them.
  test('a problem exits non-zero and does not offer to defer it', () => {
    const out = capture(() =>
      renderKnowledgePlanProgress(
        null,
        result({
          problems: [
            '`archiveEntry` is planned as restricted — but `auth: false`.',
          ],
        })
      )
    )
    assert.equal(process.exitCode, 1)
    assert.ok(out.includes('fix what the problems above name'))
    assert.ok(!out.includes('plan defer'))
  })

  test('a changeset the command could not read exits non-zero with its reason', () => {
    const out = capture(() =>
      renderKnowledgePlanProgress(
        null,
        result({ message: 'No plan for `02-nothing`.' })
      )
    )
    assert.equal(process.exitCode, 1)
    assert.ok(out.includes('No plan for'))
  })
})

describe('renderKnowledgeGaps', () => {
  let lines: string[]
  const original = console.log

  beforeEach(() => {
    lines = []
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
  })

  afterEach(() => {
    console.log = original
  })

  test('names each gap and what it left behind', () => {
    renderKnowledgeGaps(null, {
      gaps: [
        {
          note: 'knowledge/entities/entry.md',
          hash: 'abc123',
          state: 'partial',
          leftBehind: [{ item: 'scenario:x', why: 'later', at: 'now' }],
          missing: [],
          by: [],
        },
      ],
    })
    const out = lines.join('\n')
    assert.ok(out.includes('knowledge/entities/entry.md'))
    assert.ok(out.includes('scenario:x'))
  })

  test('says so when nothing is left', () => {
    renderKnowledgeGaps(null, { gaps: [] })
    assert.ok(lines.join('\n').includes('every note is built or filed'))
  })
})
