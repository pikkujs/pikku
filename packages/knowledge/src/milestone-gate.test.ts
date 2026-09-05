import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { readyMilestone, type MilestoneRefusal } from './milestone-gate.js'
import type { MilestoneNote } from './milestone.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'gate-'))
  mkdirSync(join(cwd, 'knowledge', 'milestones'), { recursive: true })
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

const GHERKIN = [
  '```gherkin',
  "Given 'owner' has no entry for today",
  "When 'owner' writes one",
  "Then 'owner' reads it back",
  '```',
].join('\n')

const milestone = (
  name: string,
  frontmatter: Record<string, string> = {},
  body = GHERKIN
) => {
  const keys = {
    type: 'milestone',
    title: 'The daily entry',
    status: 'proposed',
    entities: 'entry',
    ...frontmatter,
  }
  const fence = Object.entries(keys)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  writeFileSync(
    join(cwd, 'knowledge/milestones', name),
    `---\n${fence}\n---\n\n${body}\n`
  )
  return `knowledge/milestones/${name}`
}

const refusal = async (
  ...args: Parameters<typeof readyMilestone>
): Promise<MilestoneRefusal> => {
  const readiness = await readyMilestone(...args)
  assert.equal(readiness.ok, false, 'expected a refusal')
  return readiness as MilestoneRefusal
}

describe('readyMilestone', () => {
  test('passes a note that carries entities, gherkin and a person who acts', async () => {
    const path = milestone('01-the-daily-entry.md')
    const readiness = await readyMilestone(cwd)
    assert.equal(readiness.ok, true)
    assert.equal(readiness.ok && readiness.milestone.path, path)
    assert.deepEqual(readiness.ok && readiness.personas, ['owner'])
  })

  test('says nothing is written down, distinctly from a note that failed a rule', async () => {
    const empty = await refusal(cwd)
    assert.equal(empty.awaitingNote, true)
    assert.equal(empty.repairable, undefined)

    milestone('01-the-daily-entry.md', { entities: '' })
    const failed = await refusal(cwd)
    assert.equal(failed.awaitingNote, undefined)
    assert.match(failed.reason, /no `entities:`/)
    assert.equal(
      failed.repairable?.path,
      'knowledge/milestones/01-the-daily-entry.md'
    )
  })

  test('a milestone in flight is the refusal, ahead of anything queued behind it', async () => {
    milestone('01-the-daily-entry.md', { status: 'dispatched' })
    milestone('02-the-week.md', { entities: '' })
    const held = await refusal(cwd)
    assert.match(held.reason, /01-the-daily-entry\.md is already building/)
    assert.equal(held.repairable, undefined)
  })

  test('an unreadable status is repairable rather than invisible', async () => {
    milestone('01-the-daily-entry.md', { status: 'ready' })
    const bad = await refusal(cwd)
    assert.match(bad.reason, /`status: ready`, which is not a status/)
    assert.equal(
      bad.repairable?.path,
      'knowledge/milestones/01-the-daily-entry.md'
    )
  })

  test('a milestone being designed says the pick is missing, not the note', async () => {
    milestone('01-the-daily-entry.md', { status: 'designing' })
    const waiting = await refusal(cwd)
    assert.match(waiting.reason, /`status: designing`/)
    assert.equal(waiting.awaitingNote, undefined)
  })

  test('refuses a first-person step and quotes the line that tripped it', async () => {
    milestone(
      '01-the-daily-entry.md',
      {},
      ['```gherkin', 'Given I have no entry for today', '```'].join('\n')
    )
    const first = await refusal(cwd)
    assert.match(first.reason, /Given I have no entry for today/)
  })

  test('a double-quoted domain value is not read as scenario voice', async () => {
    milestone(
      '01-the-daily-entry.md',
      {},
      [
        '```gherkin',
        'Given \'owner\' has a checklist item called "Took my meds"',
        "Then 'owner' ticks it",
        '```',
      ].join('\n')
    )
    const readiness = await readyMilestone(cwd)
    assert.equal(readiness.ok, true)
  })

  test('refuses a scenario that names nobody, and one that quotes somebody who never acts', async () => {
    milestone(
      '01-the-daily-entry.md',
      {},
      ['```gherkin', 'Given there is no entry for today', '```'].join('\n')
    )
    assert.match((await refusal(cwd)).reason, /names nobody/)

    milestone(
      '01-the-daily-entry.md',
      {},
      [
        '```gherkin',
        "Given 'owner' has borrowed a drill and 'member2' has borrowed a hammer",
        '```',
      ].join('\n')
    )
    assert.match(
      (await refusal(cwd)).reason,
      /quotes 'member2' without ever letting them act/
    )
  })

  test('refuses an agent surface that names no tools, and an unknown surface', async () => {
    milestone('01-the-daily-entry.md', { surface: 'agent' })
    assert.match((await refusal(cwd)).reason, /names no `tools:`/)

    milestone('01-the-daily-entry.md', {
      surface: 'agent',
      tools: 'writeEntry',
    })
    assert.equal((await readyMilestone(cwd)).ok, true)

    milestone('01-the-daily-entry.md', { surface: 'telepathy' })
    assert.match(
      (await refusal(cwd)).reason,
      /`surface: telepathy`, which is not one of/
    )
  })

  test('a profile gate runs only on a note that already passed every shape check', async () => {
    const seen: string[] = []
    const gate = async (_cwd: string, note: MilestoneNote) => {
      seen.push(note.path)
      return null
    }

    milestone('01-the-daily-entry.md', { entities: '' })
    await refusal(cwd, { gate })
    assert.deepEqual(seen, [], 'a malformed note never reaches the profile')

    milestone('01-the-daily-entry.md')
    assert.equal((await readyMilestone(cwd, { gate })).ok, true)
    assert.deepEqual(seen, ['knowledge/milestones/01-the-daily-entry.md'])
  })

  test("a profile's hold is carried through as its own refusal", async () => {
    const path = milestone('01-the-daily-entry.md')
    const held = await refusal(cwd, {
      gate: async (_cwd, note) => ({
        ok: false,
        reason: 'Not dispatched: nobody has agreed the screen yet.',
        awaiting: { hold: 'screens', notes: [note] },
      }),
    })
    assert.equal(held.awaiting?.hold, 'screens')
    assert.deepEqual(
      held.awaiting?.notes.map((n) => n.path),
      [path]
    )
    assert.equal(held.repairable, undefined)
  })

  test('walks past a note whose budget is gone and dispatches the one behind it', async () => {
    const stuck = milestone('01-the-connection-check.md', { entities: '' })
    const fine = milestone('02-browsing-backbone.md')

    const wedged = await refusal(cwd)
    assert.equal(wedged.repairable?.path, stuck)

    const readiness = await readyMilestone(cwd, {
      exhausted: (note) => note.path === stuck,
    })
    assert.equal(readiness.ok && readiness.milestone.path, fine)
  })

  test('keeps the first refusal when every queued note is exhausted', async () => {
    const stuck = milestone('01-the-connection-check.md', { entities: '' })
    milestone('02-browsing-backbone.md', { entities: '' })
    const refused = await refusal(cwd, { exhausted: () => true })
    assert.equal(refused.repairable?.path, stuck)
  })
})
