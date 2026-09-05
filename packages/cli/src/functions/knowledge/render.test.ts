import assert from 'node:assert'
import { afterEach, describe, test } from 'node:test'
import type {
  KnowledgePlanProgressResult,
  KnowledgeReconcileResult,
} from '@pikku/knowledge'
import {
  renderKnowledgePlanProgress,
  renderKnowledgeReconcile,
} from './render.js'

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

describe('renderKnowledgeReconcile', () => {
  afterEach(() => {
    process.exitCode = 0
  })

  const action = (
    over: Partial<KnowledgeReconcileResult> = {}
  ): KnowledgeReconcileResult => ({
    kind: 'idle',
    reason: 'nothing is written down yet',
    ...over,
  })

  test('idle says why and nothing else', () => {
    const out = capture(() =>
      renderKnowledgeReconcile(null, action({ kind: 'idle' }))
    )
    assert.match(out, /nothing is written down yet/)
    assert.doesNotMatch(out, /IDLE/)
  })

  test('a question is numbered with its options, and the machine reason is demoted', () => {
    const out = capture(() =>
      renderKnowledgeReconcile(
        null,
        action({
          kind: 'ask-user',
          note: 'knowledge/milestones/01-the-daily-entry.md',
          reason: 'Not dispatched: `status: ready` is not a status.',
          question: {
            header: 'Where it stands',
            question: 'Where has "The daily entry" got to?',
            options: [
              {
                label: 'proposed',
                description: 'settled, and ready to be built',
              },
              { label: 'built', description: 'already built' },
            ],
          },
        })
      )
    )
    assert.match(out, /ASK/)
    assert.match(out, /Where has "The daily entry" got to\?/)
    assert.match(out, /1\. proposed/)
    assert.match(out, /2\. built/)
    // The refusal is still readable, but under `why:` rather than as the question.
    assert.match(out, /why:/)
    const question = out.indexOf('Where has')
    assert.ok(
      question < out.indexOf('why:'),
      'the question comes before the reason'
    )
  })

  test('a free-text question says so rather than printing an empty list', () => {
    const out = capture(() =>
      renderKnowledgeReconcile(
        null,
        action({
          kind: 'ask-user',
          note: 'knowledge/milestones/01-the-daily-entry.md',
          reason: 'Not dispatched: no `entities:`.',
          question: {
            header: 'What it is about',
            question: 'What is the main thing this is about?',
            options: [],
          },
        })
      )
    )
    assert.match(out, /\(free text\)/)
  })

  test('a hold names what it is held on and which notes', () => {
    const out = capture(() =>
      renderKnowledgeReconcile(
        null,
        action({
          kind: 'hold',
          reason: 'Not dispatched: nobody has agreed the screen yet.',
          hold: 'screens',
          notes: ['knowledge/screens/today.md'],
        })
      )
    )
    assert.match(out, /HELD/)
    assert.match(out, /held on:\s+screens/)
    assert.match(out, /knowledge\/screens\/today\.md/)
  })
})
