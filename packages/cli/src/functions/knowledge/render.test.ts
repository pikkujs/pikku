import assert from 'node:assert'
import { afterEach, describe, test } from 'node:test'
import type { KnowledgePlanProgressResult } from '@pikku/knowledge'
import { renderKnowledgePlanProgress } from './render.js'

const result = (
  over: Partial<KnowledgePlanProgressResult> = {}
): KnowledgePlanProgressResult => ({
  ok: false,
  path: 'knowledge/milestones/01-the-daily-entry.plan.json',
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
  afterEach(() => {
    process.exitCode = undefined
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

  test('a milestone the command could not read exits non-zero with its reason', () => {
    const out = capture(() =>
      renderKnowledgePlanProgress(
        null,
        result({ message: 'No milestone `02-nothing`.' })
      )
    )
    assert.equal(process.exitCode, 1)
    assert.ok(out.includes('No milestone'))
  })
})
